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
import { deepseek, DEEPSEEK_MODEL, ChatMessage } from '@/lib/ai/deepseek';
import { guardOutput } from '@/lib/ai/guardrails/output-guard';
import { getMentor, MentorPersona } from '@/lib/ai/mentors/personas';
import { analyzeStances, getDebateOrder } from './stance-analyzer';
import { generateOpening, decideNextSpeaker, generateTransition } from './moderator-agent';
import { synthesize } from './synthesizer-agent';

export type GroupMode = 'discuss' | 'debate';
export type GroupIntent = 'discuss' | 'summarize';

// 圆桌单次 LLM 调用统一超时（超时算一次失败，走已有的重试→弃权链路）
const GROUP_LLM_TIMEOUT_MS = 20_000;

interface GroupChatOptions {
    mentorIds: string[];
    mode: GroupMode;
    intent?: GroupIntent;
    topic?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string; mentorId?: string; round?: number }>;
    /** 用户既往洞察（ProfileMemory 内容，第二人称），用于开场白与大师 prompt 的延续感注入 */
    userInsights?: string[];
    /** 请求中止信号：客户端断线后不再发起剩余 LLM 调用 */
    signal?: AbortSignal;
}

interface MentorTurn {
    mentorId: string;
    mentorName: string;
    mentor: MentorPersona;
    content: string;
    round: number;
    wantToRespond?: string[]; // Layer 2: 想回应的大师 ID（显式 @ 声明）
    passed?: boolean;         // 弃权：本轮选择不发言
    passReason?: string;      // 弃权理由（可选，一句话）
}

/**
 * 解析大师原始回复：弃权协议 + 显式 @ 意图
 *
 * 约定（写在 mentor system prompt 里）：
 * - 以 [PASS] 开头 = 本轮弃权，后跟可选的一句话理由
 * - 单独一行 @大师名 = 显式请求该大师回应（替代旧的"提到名字即视为想回应"启发式，
 *   提到 ≠ 想对话，字符串包含匹配误判率高）
 */
export function parseMentorReply(
    raw: string,
    self: MentorPersona,
    allMentors: MentorPersona[],
): { content: string; wantToRespond: string[]; passed: boolean; passReason?: string } {
    // 消毒：模型会模仿共享历史的 "[头像 名字]: " 格式给自己加前缀（真跑实测出现过）
    const trimmed = raw.trim().replace(/^\[[^\]]{1,30}\][:：]\s*/, '');

    if (trimmed.startsWith('[PASS]')) {
        // 模型会往理由里走私正文（真跑实测）：只取第一个短句并硬顶 30 字
        const reason = trimmed.slice('[PASS]'.length).trim().split(/[。！？：；—\n]/)[0].slice(0, 30);
        return { content: '', wantToRespond: [], passed: true, ...(reason ? { passReason: reason } : {}) };
    }

    const wantToRespond: string[] = [];
    for (const line of trimmed.split('\n')) {
        const m = line.trim().match(/^@(.{1,20})$/);
        if (!m) continue;
        const tag = m[1].trim();
        const target = allMentors.find(other =>
            other.id !== self.id && (other.name === tag || other.name.includes(tag) || tag.includes(other.name))
        );
        if (target && !wantToRespond.includes(target.id)) {
            wantToRespond.push(target.id);
        }
    }

    return { content: trimmed, wantToRespond, passed: false };
}

/**
 * 输出护栏：圆桌是"先拿全文再假流式"，所有 LLM 生成的用户可见文本
 * （大师发言 / 主持人 / 总结 / 弃权理由）在分块吐出之前必须过这里。
 * fail-closed：护栏自身异常时返回固定安全文案，不透传原文。
 */
const GROUP_GUARD_FALLBACK = '这段话我想再斟酌一下，先不展开了。';

function safeGuardText(text: string): string {
    try {
        return guardOutput(text).redactedResponse; // safe 时 redactedResponse 即原文
    } catch (e) {
        console.error('[Orchestrator] output guard failed:', e);
        return GROUP_GUARD_FALLBACK;
    }
}

/**
 * 构建用户既往洞察上下文块（记忆注入）
 */
function buildUserContextBlock(userInsights?: string[]): string {
    if (!userInsights || userInsights.length === 0) return '';
    const lines = userInsights.slice(0, 5).map(i => `- ${i}`).join('\n');
    return `\n\n**【关于这位朋友】**（你从过往对话中对TA的了解，仅用于理解TA的处境；可以自然地体现延续感，但不要逐条复述，不要让TA觉得被档案化）：\n${lines}`;
}


/**
 * 群组对话编排器 v2
 */
export async function* orchestrateGroupChat(
    options: GroupChatOptions
): AsyncGenerator<GroupSSEPayload> {
    const { mentorIds, mode, topic, messages, intent = 'discuss', userInsights, signal } = options;
    if (signal?.aborted) return;
    const userContext = buildUserContextBlock(userInsights);

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

    if (intent === 'summarize') {
        const synthesisStart = Date.now();
        const priorReplies = buildPriorMentorTurns(messages, mentors);

        yield { type: 'moderator', content: '我把刚才的观点整理一下——', action: 'synthesize' };

        if (priorReplies.length === 0) {
            yield { type: 'synthesis', content: '还没有足够的圆桌发言可以总结。先让几位大师各自说一轮，再来整理会更有意义。' };
        } else {
            const summary = await synthesize(
                mentors, mode, effectiveTopic,
                priorReplies.map(r => ({
                    mentorName: r.mentorName,
                    mentorId: r.mentorId,
                    content: r.content,
                    round: r.round,
                }))
            );
            yield { type: 'synthesis', content: safeGuardText(summary) };
        }

        yield { type: 'phase_metrics', phase: 'synthesis', durationMs: Date.now() - synthesisStart };
        yield { type: 'done' };
        return;
    }

    // 计算当前轮次
    const existingMentorReplies = messages.filter(m => m.role === 'assistant' && m.mentorId).length;
    const isFirstInteraction = existingMentorReplies === 0;

    // 所有轮次的回复收集（用于 Synthesizer）
    const allReplies: MentorTurn[] = [];

    // ═══ PHASE 0: Moderator 开场白（仅首次交互）═══
    if (isFirstInteraction) {
        const phase0Start = Date.now();
        try {
            const opening = await generateOpening(mentors, mode, effectiveTopic, userInsights);
            yield {
                type: 'moderator',
                content: safeGuardText(opening),
                action: 'opening',
            };
        } catch (e) {
            console.error('[Orchestrator] Moderator opening failed:', e);
        }
        yield { type: 'phase_metrics', phase: 'opening', durationMs: Date.now() - phase0Start };
    }

    // ═══ PHASE 1: Round 1 — 并行独立表态（Layer 3）═══
    const round1 = isFirstInteraction ? 1 : Math.floor(existingMentorReplies / mentors.length) + 1;

    // 辩论模式：先分析立场，并按正/反/中立交叉排列生成发言顺序
    let stanceInfo = '';
    let speakOrder = [...mentorIds];
    if (mode === 'debate' && effectiveTopic) {
        try {
            const stances = await analyzeStances(effectiveTopic, mentors);
            stanceInfo = stances.stances
                .map(s => `${s.mentorId}: ${s.stance === 'for' ? '正方' : s.stance === 'against' ? '反方' : '中立'} — ${s.briefReason}`)
                .join('\n');
            speakOrder = getDebateOrder(stances, mentorIds);
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
            mentors, mode, effectiveTopic, lastUserMessage, stanceInfo, sharedHistory, userContext
        );

        // 辩论模式按正/反交叉顺序展示，讨论模式保持原序
        const orderedResults = [...round1Results].sort(
            (a, b) => speakOrder.indexOf(a.mentorId) - speakOrder.indexOf(b.mentorId)
        );

        // 串行 yield 结果（保持 UI 按序显示）
        for (const result of orderedResults) {
            // 调用失败/空响应 = 安静弃权，不再伪造"沉思了一会儿"的假发言气泡
            if (result.passed) {
                yield {
                    type: 'mentor_pass',
                    mentorId: result.mentorId,
                    mentorName: result.mentorName,
                    mentorAvatar: result.mentor.avatar,
                    round: round1,
                    ...(result.passReason ? { reason: result.passReason } : {}),
                };
                continue;
            }

            yield {
                type: 'mentor_start',
                mentorId: result.mentorId,
                mentorName: result.mentorName,
                mentorAvatar: result.mentor.avatar,
                mentorColor: result.mentor.themeColor,
                round: round1,
            };

            // 保留分块事件结构（前端逐块渲染），连续 yield 不再人为 sleep 拖慢
            const chunks = splitIntoChunks(result.content, 20);
            for (const chunk of chunks) {
                yield { type: 'mentor_chunk', content: chunk };
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

        // 使用 Moderator 动态点名（辩论模式候选序 = 正/反交叉排列）
        const remainingMentors = [...speakOrder];
        let consecutivePasses = 0;

        for (let i = 0; i < mentors.length; i++) {
            if (signal?.aborted) return; // 断线后不再点名剩余大师

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
                    moderatorPrompt = safeGuardText(decision.prompt);

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
                    moderatorPrompt = `${wantedMentor?.name || ''}，${prevReply.mentorName}似乎在等你的回应。`;
                    yield {
                        type: 'moderator',
                        content: moderatorPrompt,
                        action: 'point',
                        targetMentorId: wantedResponder,
                    };
                } else {
                    try {
                        const decision = await decideNextSpeaker(
                            mentors, mode, effectiveTopic, currentRoundReplies,
                            remainingMentors, round1
                        );
                        // 主持人判断可以收敛且已有人回应用户 → 不再强制余下大师发言
                        if (decision.shouldContinue === false && currentRoundReplies.length > 0) {
                            break;
                        }
                        nextMentorId = decision.nextSpeakerId;
                        moderatorPrompt = safeGuardText(decision.prompt);
                        if (moderatorPrompt) {
                            yield {
                                type: 'moderator',
                                content: moderatorPrompt,
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

            // 先生成再宣布发言者：弃权时不留空气泡
            const turn = await streamMentorReply(
                mentor, mentors, mode, effectiveTopic, lastUserMessage,
                stanceInfo, sharedHistory, currentRoundReplies, round1, userContext, moderatorPrompt
            );

            if (turn.passed) {
                yield {
                    type: 'mentor_pass',
                    mentorId: mentor.id,
                    mentorName: mentor.name,
                    mentorAvatar: mentor.avatar,
                    round: round1,
                    ...(turn.passReason ? { reason: turn.passReason } : {}),
                };
                consecutivePasses += 1;
                // 连续两位弃权 → 余下大师大概率也没有增量观点，结束本轮
                if (consecutivePasses >= 2) break;
                continue;
            }
            consecutivePasses = 0;

            yield {
                type: 'mentor_start',
                mentorId: mentor.id,
                mentorName: mentor.name,
                mentorAvatar: mentor.avatar,
                mentorColor: mentor.themeColor,
                round: round1,
            };

            // 保留分块事件结构，连续 yield 不再人为 sleep 拖慢
            const contentChunks = splitIntoChunks(turn.content, 15);
            for (const chunk of contentChunks) {
                yield { type: 'mentor_chunk', content: chunk };
            }

            yield { type: 'mentor_end', mentorId: mentor.id };

            currentRoundReplies.push(turn);
            allReplies.push(turn);
        }

        yield { type: 'round_end', round: round1 };
    }

    // ═══ PHASE 2: Round 2+（如果首次交互，自动进行第二轮）═══
    if (signal?.aborted) return;
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
                content: safeGuardText(transition),
                action: 'transition',
            };

            if (!shouldEnd) {
                // Round 2: 串行 + Moderator 动态点名（辩论模式候选序 = 正/反交叉排列）
                const round2 = 2;
                const round2Replies: MentorTurn[] = [];
                const remaining = [...speakOrder];
                let round2Passes = 0;
                const sharedHistory = allReplies
                    .map(r => `[${r.mentor.avatar} ${r.mentorName}]: ${r.content}`)
                    .join('\n\n');

                for (let i = 0; i < mentors.length; i++) {
                    if (signal?.aborted) return; // 断线后不再点名剩余大师

                    let nextMentorId: string;
                    let moderatorPrompt = '';

                    // Moderator 动态点名
                    const prevReply = round2Replies[round2Replies.length - 1];
                    const wantedResponder = prevReply?.wantToRespond?.find(id => remaining.includes(id));

                    if (wantedResponder) {
                        nextMentorId = wantedResponder;
                        const wm = getMentor(wantedResponder);
                        moderatorPrompt = `${wm?.name}，${prevReply?.mentorName}点名请你回应。`;
                        yield {
                            type: 'moderator',
                            content: moderatorPrompt,
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
                            // 主持人判断可以收敛且第二轮已有人发言 → 提前进入总结
                            if (decision.shouldContinue === false && round2Replies.length > 0) {
                                break;
                            }
                            nextMentorId = decision.nextSpeakerId;
                            moderatorPrompt = safeGuardText(decision.prompt);
                            if (moderatorPrompt) {
                                yield {
                                    type: 'moderator',
                                    content: moderatorPrompt,
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

                    // 先生成再宣布发言者：弃权时不留空气泡
                    const turn = await streamMentorReply(
                        mentor, mentors, mode, effectiveTopic, lastUserMessage,
                        stanceInfo, sharedHistory, round2Replies, round2, userContext, moderatorPrompt
                    );

                    if (turn.passed) {
                        yield {
                            type: 'mentor_pass',
                            mentorId: mentor.id,
                            mentorName: mentor.name,
                            mentorAvatar: mentor.avatar,
                            round: round2,
                            ...(turn.passReason ? { reason: turn.passReason } : {}),
                        };
                        round2Passes += 1;
                        // 连续两位弃权 → 结束本轮，直接总结
                        if (round2Passes >= 2) break;
                        continue;
                    }
                    round2Passes = 0;

                    yield {
                        type: 'mentor_start',
                        mentorId: mentor.id,
                        mentorName: mentor.name,
                        mentorAvatar: mentor.avatar,
                        mentorColor: mentor.themeColor,
                        round: round2,
                    };

                    const chunks = splitIntoChunks(turn.content, 15);
                    for (const chunk of chunks) {
                        yield { type: 'mentor_chunk', content: chunk };
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
    if (signal?.aborted) return;
    // 门槛按"首轮全员 + 第二轮至少一位"计（引入弃权后不再假设两整轮全员发言）
    if (allReplies.length >= mentors.length + 1 || !isFirstInteraction) {
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

            yield { type: 'synthesis', content: safeGuardText(summary) };
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
    userContext: string,
): Promise<MentorTurn[]> {
    const promises = mentors.map(async (mentor): Promise<MentorTurn> => {
        const systemPrompt = buildMentorSystemPrompt(mentor, mentors, mode, topic, stanceInfo, true, userContext);
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...(sharedHistory ? [{ role: 'system' as const, content: `【前情回顾】\n${sharedHistory}` }] : []),
            { role: 'user', content: userMessage },
        ];

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                if (attempt > 0) await sleep(1000);
                const { text } = await import('ai').then(ai => ai.generateText({
                    model: deepseek(DEEPSEEK_MODEL),
                    messages,
                    temperature: 0.9,
                    maxOutputTokens: 400,
                    abortSignal: AbortSignal.timeout(GROUP_LLM_TIMEOUT_MS),
                }));

                if (text && text.trim().length > 0) {
                    const parsed = parseMentorReply(text, mentor, mentors);
                    return {
                        mentorId: mentor.id,
                        mentorName: mentor.name,
                        mentor,
                        content: safeGuardText(parsed.content),
                        round: 1,
                        wantToRespond: parsed.wantToRespond,
                        passed: parsed.passed,
                        ...(parsed.passReason ? { passReason: safeGuardText(parsed.passReason) } : {}),
                    };
                }
                console.warn(`[Round1 Parallel] ${mentor.name} returned empty (attempt ${attempt + 1})`);
            } catch (e) {
                console.error(`[Round1 Parallel] ${mentor.name} failed (attempt ${attempt + 1}):`, e);
            }
        }
        // 调用失败 = 安静弃权（不再伪造"沉思"占位发言）
        return {
            mentorId: mentor.id,
            mentorName: mentor.name,
            mentor,
            content: '',
            round: 1,
            passed: true,
        };
    });

    return Promise.all(promises);
}

/**
 * 串行生成单个 Mentor 回复（带弃权协议 + 显式 @ 意图解析）
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
    userContext: string,
    moderatorPrompt?: string,
): Promise<MentorTurn> {
    const systemPrompt = buildMentorSystemPrompt(mentor, allMentors, mode, topic, stanceInfo, false, userContext);

    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...(sharedHistory ? [{ role: 'system' as const, content: `【前情回顾】\n${sharedHistory}` }] : []),
        ...currentRoundReplies.map(turn => ({
            role: 'assistant' as const,
            content: `[${turn.mentor.avatar} ${turn.mentorName}]: ${turn.content}`,
        })),
        { role: 'user', content: userMessage },
        // 主持人的点名引导必须进被点名者的上下文——否则大师看不到追问、只会对原始问题复读
        ...(moderatorPrompt ? [{ role: 'user' as const, content: `[🎭 主持人]: ${moderatorPrompt}` }] : []),
    ];

    let fullContent = '';
    for (let attempt = 0; attempt < 2; attempt++) {
        fullContent = '';
        try {
            if (attempt > 0) {
                console.warn(`[MentorReply] ${mentor.name} retrying (attempt ${attempt + 1})...`);
                await sleep(1500); // 重试前等待，避免触发 QPM 限制
            }
            const result = await streamText({
                model: deepseek(DEEPSEEK_MODEL),
                messages,
                temperature: 0.9,
                maxOutputTokens: 400,
                // 超时覆盖整段流消费；触发时 for-await 抛错，走本循环的重试→弃权
                abortSignal: AbortSignal.timeout(GROUP_LLM_TIMEOUT_MS),
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

    // 调用失败 = 安静弃权（不再伪造"沉思"占位发言）
    if (!fullContent.trim()) {
        return {
            mentorId: mentor.id,
            mentorName: mentor.name,
            mentor,
            content: '',
            round,
            passed: true,
        };
    }

    // 弃权协议 + 显式 @ 意图（替代旧的"提到名字即视为想回应"启发式）
    const parsed = parseMentorReply(fullContent, mentor, allMentors);

    return {
        mentorId: mentor.id,
        mentorName: mentor.name,
        mentor,
        content: safeGuardText(parsed.content),
        round,
        wantToRespond: parsed.wantToRespond,
        passed: parsed.passed,
        ...(parsed.passReason ? { passReason: safeGuardText(parsed.passReason) } : {}),
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
    userContext?: string,
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
        : `\n**你有不发言的权利**：如果你没有新的、值得补充的观点（想说的已被别人说过，或这个话题不在你的思想射程内），请只回复 [PASS]，可在后面用一句话（20字内）说明，例如"[PASS] 卡尼曼已说出我想说的"。宁可倾听，不要凑数。
**不要复读**：前情回顾中署名为你的发言是你自己说过的话。本轮发言必须带来增量——优先回应主持人刚提出的问题或其他大师的最新观点；如果只是想重申已说过的立场，请 [PASS]。
**想请谁回应**：如果你希望某位大师回应你的观点，在发言最后单独一行写 @大师名（例如"@卡尼曼"）。不需要时省略。仅仅提到名字不算请求回应。`;

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
4. 不要重复其他大师或你自己已经说过的论点
5. 直接用你的口吻说话，不要加"XX说："前缀`;

    if (userContext) {
        prompt += userContext;
    }

    if (stanceInfo) {
        prompt += `\n\n**各方立场参考**：\n${stanceInfo}`;
    }

    prompt += `\n\n⚠️ 如果用户表达了自杀或极端危机倾向，请立即暂时脱离角色，以严肃、关切的口吻建议寻求专业医生帮助。`;

    return prompt;
}

function buildPriorMentorTurns(
    messages: Array<{ role: string; content: string; mentorId?: string; round?: number }>,
    mentors: MentorPersona[],
): MentorTurn[] {
    let inferredIndex = 0;

    return messages
        .filter(m => m.role === 'assistant' && m.mentorId)
        .map(m => {
            const mentor = mentors.find(mt => mt.id === m.mentorId);
            if (!mentor) return null;

            const inferredRound = Math.floor(inferredIndex / Math.max(mentors.length, 1)) + 1;
            inferredIndex += 1;

            return {
                mentorId: mentor.id,
                mentorName: mentor.name,
                mentor,
                content: m.content,
                round: m.round && m.round > 0 ? m.round : inferredRound,
            };
        })
        .filter((m): m is MentorTurn => Boolean(m));
}

/**
 * 构建共享历史上下文
 */
function buildSharedHistory(
    messages: Array<{ role: string; content: string; mentorId?: string; round?: number }>,
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
    | { type: 'lab_session'; labSessionId: string } // route 层开桌时发出，orchestrator 不产生
    | { type: 'mentor_start'; mentorId: string; mentorName: string; mentorAvatar: string; mentorColor: string; round: number }
    | { type: 'mentor_chunk'; content: string }
    | { type: 'mentor_end'; mentorId: string }
    | { type: 'mentor_pass'; mentorId: string; mentorName: string; mentorAvatar: string; round: number; reason?: string }
    | { type: 'moderator'; content: string; action: 'opening' | 'point' | 'transition' | 'synthesize'; targetMentorId?: string; decision?: { reason: string; shouldContinue: boolean } }
    | { type: 'synthesis'; content: string }
    | { type: 'round_end'; round: number }
    | { type: 'stance_analysis'; stances: Array<{ mentorId: string; stance: string; briefReason: string }> }
    | { type: 'phase_metrics'; phase: string; durationMs: number }
    | { type: 'done' }
    | { type: 'error'; message: string };
