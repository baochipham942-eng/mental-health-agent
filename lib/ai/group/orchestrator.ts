/**
 * Group Chat Orchestrator v2 — 三层 Agent Team 架构
 *
 * Layer 1: Moderator Agent（主持人动态编排）
 * Layer 2: Agent 可互相 @（自组织对话）
 * Layer 3: 并行 Round 1 + 串行 Round 2+ + Synthesizer 总结
 *
 * 执行流程：
 *   Moderator 开场白 →
 *   Round 1: 并行调用所有 Mentor Agent（独立表态）→
 *   Moderator 过渡语 →
 *   Round 2+: Moderator 动态点名 → Mentor 串行发言（可 @回应）→
 *   Moderator 判断收敛 →
 *   Synthesizer 总结
 */

import { streamText } from 'ai';
import { getKimiModel } from '../kimi';
import { ChatMessage } from '@/lib/ai/deepseek';
import { getMentor, MentorPersona } from '@/lib/ai/mentors/personas';
import { analyzeStances } from './stance-analyzer';
import { generateOpening, decideNextSpeaker, generateTransition } from './moderator-agent';
import { synthesize } from './synthesizer-agent';

export type GroupMode = 'discuss' | 'debate';

interface GroupChatOptions {
    mentorIds: string[];
    mode: GroupMode;
    topic?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string; mentorId?: string }>;
}

interface MentorTurn {
    mentorId: string;
    mentorName: string;
    mentor: MentorPersona;
    content: string;
    round: number;
    wantToRespond?: string[]; // Layer 2: 想回应的大师 ID
}


/**
 * 群组对话编排器 v2
 */
export async function* orchestrateGroupChat(
    options: GroupChatOptions
): AsyncGenerator<GroupSSEPayload> {
    const { mentorIds, mode, topic, messages } = options;

    const mentors = mentorIds
        .map(id => getMentor(id))
        .filter((m): m is MentorPersona => m !== undefined);

    if (mentors.length < 2) {
        yield { type: 'error', message: '至少需要2位大师参与圆桌论道' };
        return;
    }

    const userMessages = messages.filter(m => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1]?.content || topic || '';
    const effectiveTopic = topic || lastUserMessage;

    // 计算当前轮次
    const existingRounds = messages.filter(m => m.role === 'assistant').length;
    const isFirstInteraction = existingRounds === 0;

    // 所有轮次的回复收集（用于 Synthesizer）
    const allReplies: MentorTurn[] = [];

    // ═══ PHASE 0: Moderator 开场白（仅首次交互）═══
    if (isFirstInteraction) {
        const phase0Start = Date.now();
        try {
            const opening = await generateOpening(mentors, mode, effectiveTopic);
            yield {
                type: 'moderator',
                content: opening,
                action: 'opening',
            };
        } catch (e) {
            console.error('[Orchestrator] Moderator opening failed:', e);
        }
        yield { type: 'phase_metrics', phase: 'opening', durationMs: Date.now() - phase0Start };
    }

    // ═══ PHASE 1: Round 1 — 并行独立表态（Layer 3）═══
    const round1 = isFirstInteraction ? 1 : Math.floor(existingRounds / mentors.length) + 1;

    // 辩论模式：先分析立场
    let stanceInfo = '';
    if (mode === 'debate' && effectiveTopic) {
        try {
            const stances = await analyzeStances(effectiveTopic, mentors);
            stanceInfo = stances.stances
                .map(s => `${s.mentorId}: ${s.stance === 'for' ? '正方' : s.stance === 'against' ? '反方' : '中立'} — ${s.briefReason}`)
                .join('\n');
            // 持久化立场分析结果
            yield { type: 'stance_analysis', stances: stances.stances };
        } catch (e) {
            console.error('[Orchestrator] Stance analysis failed:', e);
        }
    }

    if (isFirstInteraction) {
        // Round 1: 并行调用所有 Agent
        const round1Start = Date.now();
        const sharedHistory = buildSharedHistory(messages, mentors, round1);
        const round1Results = await generateRound1Parallel(
            mentors, mode, effectiveTopic, lastUserMessage, stanceInfo, sharedHistory
        );

        // 串行 yield 结果（保持 UI 按序显示）
        for (const result of round1Results) {
            yield {
                type: 'mentor_start',
                mentorId: result.mentorId,
                mentorName: result.mentorName,
                mentorAvatar: result.mentor.avatar,
                mentorColor: result.mentor.themeColor,
                round: round1,
            };

            // 分段发送以模拟流式效果
            const chunks = splitIntoChunks(result.content, 20);
            for (const chunk of chunks) {
                yield { type: 'mentor_chunk', content: chunk };
                // 微小延迟让前端有时间渲染
                await sleep(30);
            }

            yield { type: 'mentor_end', mentorId: result.mentorId };
            allReplies.push(result);
        }

        yield { type: 'round_end', round: round1 };
        yield { type: 'phase_metrics', phase: 'round1', durationMs: Date.now() - round1Start };
    } else {
        // 非首次交互：对用户追问进行一轮回复
        const sharedHistory = buildSharedHistory(messages, mentors, round1);
        const currentRoundReplies: MentorTurn[] = [];

        // 使用 Moderator 动态点名
        const remainingMentors = [...mentorIds];

        for (let i = 0; i < mentors.length; i++) {
            let nextMentorId: string;
            let moderatorPrompt = '';

            if (i === 0) {
                // 第一位：Moderator 选择最相关的
                try {
                    const decision = await decideNextSpeaker(
                        mentors, mode, effectiveTopic, currentRoundReplies,
                        remainingMentors, round1
                    );
                    nextMentorId = decision.nextSpeakerId;
                    moderatorPrompt = decision.prompt;

                    yield {
                        type: 'moderator',
                        content: moderatorPrompt,
                        action: 'point',
                        targetMentorId: nextMentorId,
                        decision: { reason: decision.reason, shouldContinue: decision.shouldContinue },
                    };
                } catch (e) {
                    console.error('[Orchestrator] Moderator decision failed:', e);
                    nextMentorId = remainingMentors[0];
                }
            } else {
                // 后续：基于前一位的 wantToRespond 或 Moderator 决策
                const prevReply = currentRoundReplies[currentRoundReplies.length - 1];
                const wantedResponder = prevReply?.wantToRespond?.find(id => remainingMentors.includes(id));

                if (wantedResponder) {
                    nextMentorId = wantedResponder;
                    const wantedMentor = getMentor(wantedResponder);
                    yield {
                        type: 'moderator',
                        content: `${wantedMentor?.name || ''}，${prevReply.mentorName}似乎在等你的回应。`,
                        action: 'point',
                        targetMentorId: wantedResponder,
                    };
                } else {
                    try {
                        const decision = await decideNextSpeaker(
                            mentors, mode, effectiveTopic, currentRoundReplies,
                            remainingMentors, round1
                        );
                        nextMentorId = decision.nextSpeakerId;
                        if (decision.prompt) {
                            yield {
                                type: 'moderator',
                                content: decision.prompt,
                                action: 'point',
                                targetMentorId: nextMentorId,
                                decision: { reason: decision.reason, shouldContinue: decision.shouldContinue },
                            };
                        }
                    } catch (e) {
                        nextMentorId = remainingMentors[0];
                    }
                }
            }

            // 确保 ID 有效
            if (!remainingMentors.includes(nextMentorId)) {
                nextMentorId = remainingMentors[0];
            }

            const mentor = mentors.find(m => m.id === nextMentorId);
            if (!mentor) continue;

            // 从剩余列表中移除
            const idx = remainingMentors.indexOf(nextMentorId);
            if (idx > -1) remainingMentors.splice(idx, 1);

            // 流式生成大师回复
            yield {
                type: 'mentor_start',
                mentorId: mentor.id,
                mentorName: mentor.name,
                mentorAvatar: mentor.avatar,
                mentorColor: mentor.themeColor,
                round: round1,
            };

            const turn = await streamMentorReply(
                mentor, mentors, mode, effectiveTopic, lastUserMessage,
                stanceInfo, sharedHistory, currentRoundReplies, round1,
                () => { /* yield handled below */ }
            );

            // 流式输出
            const contentChunks = splitIntoChunks(turn.content, 15);
            for (const chunk of contentChunks) {
                yield { type: 'mentor_chunk', content: chunk };
                await sleep(25);
            }

            yield { type: 'mentor_end', mentorId: mentor.id };

            currentRoundReplies.push(turn);
            allReplies.push(turn);
        }

        yield { type: 'round_end', round: round1 };
    }

    // ═══ PHASE 2: Round 2+（如果首次交互，自动进行第二轮）═══
    if (isFirstInteraction && mentors.length >= 2) {
        // Moderator 过渡语
        try {
            const { transition, shouldEnd } = await generateTransition(
                mentors, effectiveTopic,
                allReplies.map(r => ({ mentorName: r.mentorName, content: r.content })),
                1
            );

            yield {
                type: 'moderator',
                content: transition,
                action: 'transition',
            };

            if (!shouldEnd) {
                // Round 2: 串行 + Moderator 动态点名
                const round2 = 2;
                const round2Replies: MentorTurn[] = [];
                const remaining = [...mentorIds];
                const sharedHistory = allReplies
                    .map(r => `[${r.mentor.avatar} ${r.mentorName}]: ${r.content}`)
                    .join('\n\n');

                for (let i = 0; i < mentors.length; i++) {
                    let nextMentorId: string;

                    // Moderator 动态点名
                    const prevReply = round2Replies[round2Replies.length - 1];
                    const wantedResponder = prevReply?.wantToRespond?.find(id => remaining.includes(id));

                    if (wantedResponder) {
                        nextMentorId = wantedResponder;
                        const wm = getMentor(wantedResponder);
                        yield {
                            type: 'moderator',
                            content: `${wm?.name}，请回应。`,
                            action: 'point',
                            targetMentorId: wantedResponder,
                        };
                    } else {
                        try {
                            const decision = await decideNextSpeaker(
                                mentors, mode, effectiveTopic,
                                [...allReplies, ...round2Replies],
                                remaining, round2
                            );
                            nextMentorId = decision.nextSpeakerId;
                            if (decision.prompt) {
                                yield {
                                    type: 'moderator',
                                    content: decision.prompt,
                                    action: 'point',
                                    targetMentorId: nextMentorId,
                                    decision: { reason: decision.reason, shouldContinue: decision.shouldContinue },
                                };
                            }
                        } catch (e) {
                            nextMentorId = remaining[0];
                        }
                    }

                    if (!remaining.includes(nextMentorId)) {
                        nextMentorId = remaining[0];
                    }

                    const mentor = mentors.find(m => m.id === nextMentorId);
                    if (!mentor) continue;

                    const ridx = remaining.indexOf(nextMentorId);
                    if (ridx > -1) remaining.splice(ridx, 1);

                    yield {
                        type: 'mentor_start',
                        mentorId: mentor.id,
                        mentorName: mentor.name,
                        mentorAvatar: mentor.avatar,
                        mentorColor: mentor.themeColor,
                        round: round2,
                    };

                    const turn = await streamMentorReply(
                        mentor, mentors, mode, effectiveTopic, lastUserMessage,
                        stanceInfo, sharedHistory, round2Replies, round2,
                        () => {}
                    );

                    const chunks = splitIntoChunks(turn.content, 15);
                    for (const chunk of chunks) {
                        yield { type: 'mentor_chunk', content: chunk };
                        await sleep(25);
                    }

                    yield { type: 'mentor_end', mentorId: mentor.id };
                    round2Replies.push(turn);
                    allReplies.push(turn);
                }

                yield { type: 'round_end', round: round2 };
            }
        } catch (e) {
            console.error('[Orchestrator] Round 2 transition failed:', e);
        }
    }

    // ═══ PHASE 3: Synthesizer 总结（Layer 3）═══
    if (allReplies.length >= mentors.length * 2 || !isFirstInteraction) {
        const synthesisStart = Date.now();
        try {
            yield { type: 'moderator', content: '让我来梳理一下各位的观点——', action: 'synthesize' };

            const summary = await synthesize(
                mentors, mode, effectiveTopic,
                allReplies.map(r => ({
                    mentorName: r.mentorName,
                    mentorId: r.mentorId,
                    content: r.content,
                    round: r.round,
                }))
            );

            yield { type: 'synthesis', content: summary };
        } catch (e) {
            console.error('[Orchestrator] Synthesis failed:', e);
        }
        yield { type: 'phase_metrics', phase: 'synthesis', durationMs: Date.now() - synthesisStart };
    }

    yield { type: 'done' };
}

/**
 * Round 1: 并行调用所有 Mentor（Layer 3）
 */
async function generateRound1Parallel(
    mentors: MentorPersona[],
    mode: GroupMode,
    topic: string,
    userMessage: string,
    stanceInfo: string,
    sharedHistory: string,
): Promise<MentorTurn[]> {
    const promises = mentors.map(async (mentor) => {
        const systemPrompt = buildMentorSystemPrompt(mentor, mentors, mode, topic, stanceInfo, true);
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...(sharedHistory ? [{ role: 'system' as const, content: `【前情回顾】\n${sharedHistory}` }] : []),
            { role: 'user', content: userMessage },
        ];

        const fallbackContent = `（${mentor.name}沉思了一会儿，但暂时没有发言）`;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                if (attempt > 0) await sleep(1000);
                const { text } = await import('ai').then(ai => ai.generateText({
                    model: getKimiModel(),
                    messages,
                    temperature: 0.9,
                    maxOutputTokens: 400,
                }));

                if (text && text.trim().length > 0) {
                    return {
                        mentorId: mentor.id,
                        mentorName: mentor.name,
                        mentor,
                        content: text,
                        round: 1,
                    };
                }
                console.warn(`[Round1 Parallel] ${mentor.name} returned empty (attempt ${attempt + 1})`);
            } catch (e) {
                console.error(`[Round1 Parallel] ${mentor.name} failed (attempt ${attempt + 1}):`, e);
            }
        }
        return {
            mentorId: mentor.id,
            mentorName: mentor.name,
            mentor,
            content: fallbackContent,
            round: 1,
        };
    });

    return Promise.all(promises);
}

/**
 * 串行生成单个 Mentor 回复（带 @ 意图提取）
 */
async function streamMentorReply(
    mentor: MentorPersona,
    allMentors: MentorPersona[],
    mode: GroupMode,
    topic: string,
    userMessage: string,
    stanceInfo: string,
    sharedHistory: string,
    currentRoundReplies: MentorTurn[],
    round: number,
    _onChunk: (chunk: string) => void,
): Promise<MentorTurn> {
    const systemPrompt = buildMentorSystemPrompt(mentor, allMentors, mode, topic, stanceInfo, false);

    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...(sharedHistory ? [{ role: 'system' as const, content: `【前情回顾】\n${sharedHistory}` }] : []),
        ...currentRoundReplies.map(turn => ({
            role: 'assistant' as const,
            content: `[${turn.mentor.avatar} ${turn.mentorName}]: ${turn.content}`,
        })),
        { role: 'user', content: userMessage },
    ];

    let fullContent = '';
    const fallbackContent = `（${mentor.name}沉思了一会儿，但暂时没有发言）`;
    for (let attempt = 0; attempt < 2; attempt++) {
        fullContent = '';
        try {
            if (attempt > 0) {
                console.warn(`[MentorReply] ${mentor.name} retrying (attempt ${attempt + 1})...`);
                await sleep(1500); // 重试前等待，避免触发 QPM 限制
            }
            const result = await streamText({
                model: getKimiModel(),
                messages,
                temperature: 0.9,
                maxOutputTokens: 400,
            });

            for await (const chunk of result.textStream) {
                fullContent += chunk;
            }

            if (fullContent.trim().length > 0) break; // 有内容就不重试
            console.warn(`[MentorReply] ${mentor.name} returned empty (attempt ${attempt + 1})`);
        } catch (e) {
            console.error(`[MentorReply] ${mentor.name} failed (attempt ${attempt + 1}):`, e);
        }
    }
    if (!fullContent.trim()) {
        fullContent = fallbackContent;
    }

    // Layer 2: 提取 @ 意图（启发式：回复中提到其他大师名字 = 想回应）
    const wantToRespond: string[] = [];
    for (const other of allMentors) {
        if (other.id !== mentor.id && fullContent.includes(other.name)) {
            wantToRespond.push(other.id);
        }
    }

    return {
        mentorId: mentor.id,
        mentorName: mentor.name,
        mentor,
        content: fullContent,
        round,
        wantToRespond,
    };
}

/**
 * 构建大师的 system prompt
 */
function buildMentorSystemPrompt(
    mentor: MentorPersona,
    allMentors: MentorPersona[],
    mode: GroupMode,
    topic?: string,
    stanceInfo?: string,
    isParallelRound?: boolean,
): string {
    const otherMentors = allMentors
        .filter(m => m.id !== mentor.id)
        .map(m => `${m.avatar} ${m.name}（${m.title}）`)
        .join('、');

    const modeInstruction = mode === 'debate'
        ? `这是一场**辩论**。你需要鲜明地表达立场，可以友善但犀利地回应其他大师的观点，指出你认为的逻辑漏洞或视角盲区。不要和稀泥。`
        : `这是一场**圆桌讨论**。你可以自由延伸、补充或温和质疑其他大师的观点，也可以从你独特的视角提供全新的切入点。`;

    const parallelNote = isParallelRound
        ? `\n注意：这是第一轮，你还没有看到其他大师的观点。请独立表达你对话题的看法。`
        : `\n如果你想回应某位大师，可以直接提到他的名字。`;

    let prompt = `${mentor.systemPrompt}

---
**【圆桌论道模式】**
你正在与 ${otherMentors} 一起参与圆桌对话。
${topic ? `讨论话题：${topic}` : ''}
${modeInstruction}
${parallelNote}

**发言规则**：
1. 控制在 200 字以内，简洁有力
2. 如果前面有其他大师发言，可以回应他们的观点（赞同、补充或反驳）
3. 用你独有的思维方式和语言风格发言
4. 不要重复其他大师已经说过的论点
5. 直接用你的口吻说话，不要加"XX说："前缀`;

    if (stanceInfo) {
        prompt += `\n\n**各方立场参考**：\n${stanceInfo}`;
    }

    prompt += `\n\n⚠️ 如果用户表达了自杀或极端危机倾向，请立即暂时脱离角色，以严肃、关切的口吻建议寻求专业医生帮助。`;

    return prompt;
}

/**
 * 构建共享历史上下文
 */
function buildSharedHistory(
    messages: Array<{ role: string; content: string; mentorId?: string }>,
    mentors: MentorPersona[],
    _currentRound: number,
): string {
    const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.mentorId);

    if (assistantMsgs.length === 0) return '';

    if (assistantMsgs.length <= mentors.length * 3) {
        return assistantMsgs
            .map(m => {
                const mentor = mentors.find(mt => mt.id === m.mentorId);
                const name = mentor ? `${mentor.avatar} ${mentor.name}` : m.mentorId;
                return `[${name}]: ${m.content}`;
            })
            .join('\n\n');
    }

    const recentCount = mentors.length * 2;
    const recent = assistantMsgs.slice(-recentCount);
    const older = assistantMsgs.slice(0, -recentCount);

    const olderSummary = older
        .map(m => {
            const mentor = mentors.find(mt => mt.id === m.mentorId);
            const name = mentor ? mentor.name : m.mentorId;
            const brief = m.content.length > 50 ? m.content.slice(0, 50) + '...' : m.content;
            return `${name}: ${brief}`;
        })
        .join(' | ');

    const recentFull = recent
        .map(m => {
            const mentor = mentors.find(mt => mt.id === m.mentorId);
            const name = mentor ? `${mentor.avatar} ${mentor.name}` : m.mentorId;
            return `[${name}]: ${m.content}`;
        })
        .join('\n\n');

    return `【早期讨论摘要】${olderSummary}\n\n【近期发言】\n${recentFull}`;
}

// 辅助：将文本分成小块以模拟流式效果
function splitIntoChunks(text: string, avgChunkSize: number): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
        const size = Math.max(1, avgChunkSize + Math.floor(Math.random() * 10) - 5);
        chunks.push(text.slice(i, i + size));
        i += size;
    }
    return chunks;
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// SSE 事件类型（扩展）
export type GroupSSEPayload =
    | { type: 'mentor_start'; mentorId: string; mentorName: string; mentorAvatar: string; mentorColor: string; round: number }
    | { type: 'mentor_chunk'; content: string }
    | { type: 'mentor_end'; mentorId: string }
    | { type: 'moderator'; content: string; action: 'opening' | 'point' | 'transition' | 'synthesize'; targetMentorId?: string; decision?: { reason: string; shouldContinue: boolean } }
    | { type: 'synthesis'; content: string }
    | { type: 'round_end'; round: number }
    | { type: 'stance_analysis'; stances: Array<{ mentorId: string; stance: string; briefReason: string }> }
    | { type: 'phase_metrics'; phase: string; durationMs: number }
    | { type: 'done' }
    | { type: 'error'; message: string };
