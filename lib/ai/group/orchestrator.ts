import { streamText } from 'ai';
import { deepseek, ChatMessage } from '@/lib/ai/deepseek';
import { getMentor, MentorPersona } from '@/lib/ai/mentors/personas';
import { analyzeStances, getDebateOrder } from './stance-analyzer';

export type GroupMode = 'discuss' | 'debate';

interface GroupChatOptions {
    mentorIds: string[];
    mode: GroupMode;
    topic?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string; mentorId?: string }>;
}

interface MentorTurn {
    mentorId: string;
    mentor: MentorPersona;
    content: string;
}

/**
 * 群组对话编排器
 * 串行调用每位大师，前一位的回复注入后一位的上下文
 */
export async function* orchestrateGroupChat(
    options: GroupChatOptions
): AsyncGenerator<GroupSSEPayload> {
    const { mentorIds, mode, topic, messages } = options;

    // 获取大师信息
    const mentors = mentorIds
        .map(id => getMentor(id))
        .filter((m): m is MentorPersona => m !== undefined);

    if (mentors.length < 2) {
        yield { type: 'error', message: '至少需要2位大师参与圆桌论道' };
        return;
    }

    // 获取用户最新消息
    const userMessages = messages.filter(m => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1]?.content || topic || '';

    // 确定发言顺序
    let speakingOrder = mentorIds;
    let stanceInfo = '';

    if (mode === 'debate' && topic) {
        try {
            const stances = await analyzeStances(topic, mentors);
            speakingOrder = getDebateOrder(stances, mentorIds);
            stanceInfo = stances.stances
                .map(s => `${s.mentorId}: ${s.stance === 'for' ? '正方' : s.stance === 'against' ? '反方' : '中立'} — ${s.briefReason}`)
                .join('\n');
        } catch (e) {
            console.error('[GroupOrchestrator] Stance analysis failed, using default order:', e);
        }
    }

    // 计算当前轮次
    const existingRounds = messages.filter(m => m.role === 'assistant').length;
    const currentRound = Math.floor(existingRounds / mentors.length) + 1;

    // 构建共享历史上下文（压缩超过3轮的历史）
    const sharedHistory = buildSharedHistory(messages, mentors, currentRound);

    // 本轮各大师的回复收集
    const currentRoundReplies: MentorTurn[] = [];

    // 依次让每位大师发言
    for (const mentorId of speakingOrder) {
        const mentor = mentors.find(m => m.id === mentorId);
        if (!mentor) continue;

        // 通知前端：大师开始发言
        yield {
            type: 'mentor_start',
            mentorId: mentor.id,
            mentorName: mentor.name,
            mentorAvatar: mentor.avatar,
            mentorColor: mentor.themeColor,
            round: currentRound,
        };

        // 构建该大师的 system prompt
        const systemPrompt = buildMentorSystemPrompt(mentor, mentors, mode, topic, stanceInfo);

        // 构建该大师的消息序列
        const mentorMessages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            // 注入共享历史
            ...(sharedHistory ? [{ role: 'system' as const, content: `【前情回顾】\n${sharedHistory}` }] : []),
            // 注入本轮之前大师的回复
            ...currentRoundReplies.map(turn => ({
                role: 'assistant' as const,
                content: `[${turn.mentor.avatar} ${turn.mentor.name}]: ${turn.content}`,
            })),
            // 用户的消息
            { role: 'user', content: lastUserMessage },
        ];

        // 流式调用 DeepSeek
        let fullContent = '';
        try {
            const result = await streamText({
                model: deepseek('deepseek-chat'),
                messages: mentorMessages,
                temperature: 0.9,
                maxTokens: 400,
            });

            for await (const chunk of result.textStream) {
                fullContent += chunk;
                yield { type: 'mentor_chunk', content: chunk };
            }
        } catch (e) {
            console.error(`[GroupOrchestrator] Error streaming ${mentorId}:`, e);
            fullContent = `（${mentor.name}沉思了一会儿，但暂时没有发言）`;
            yield { type: 'mentor_chunk', content: fullContent };
        }

        // 记录该大师的完整回复
        currentRoundReplies.push({
            mentorId: mentor.id,
            mentor,
            content: fullContent,
        });

        yield { type: 'mentor_end', mentorId: mentor.id };
    }

    yield { type: 'round_end', round: currentRound };
    yield { type: 'done' };
}

/**
 * 构建大师的 system prompt（注入群组上下文）
 */
function buildMentorSystemPrompt(
    mentor: MentorPersona,
    allMentors: MentorPersona[],
    mode: GroupMode,
    topic?: string,
    stanceInfo?: string,
): string {
    const otherMentors = allMentors
        .filter(m => m.id !== mentor.id)
        .map(m => `${m.avatar} ${m.name}（${m.title}）`)
        .join('、');

    const modeInstruction = mode === 'debate'
        ? `这是一场**辩论**。你需要鲜明地表达立场，可以友善但犀利地回应其他大师的观点，指出你认为的逻辑漏洞或视角盲区。不要和稀泥。`
        : `这是一场**圆桌讨论**。你可以自由延伸、补充或温和质疑其他大师的观点，也可以从你独特的视角提供全新的切入点。`;

    let prompt = `${mentor.systemPrompt}

---
**【圆桌论道模式】**
你正在与 ${otherMentors} 一起参与圆桌对话。
${topic ? `讨论话题：${topic}` : ''}
${modeInstruction}

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
 * 构建共享历史上下文（超过3轮自动压缩）
 */
function buildSharedHistory(
    messages: Array<{ role: string; content: string; mentorId?: string }>,
    mentors: MentorPersona[],
    currentRound: number,
): string {
    const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.mentorId);

    if (assistantMsgs.length === 0) return '';

    // 如果历史不多，直接返回
    if (assistantMsgs.length <= mentors.length * 3) {
        return assistantMsgs
            .map(m => {
                const mentor = mentors.find(mt => mt.id === m.mentorId);
                const name = mentor ? `${mentor.avatar} ${mentor.name}` : m.mentorId;
                return `[${name}]: ${m.content}`;
            })
            .join('\n\n');
    }

    // 超过3轮，只保留最近2轮的完整内容，之前的压缩
    const recentCount = mentors.length * 2;
    const recent = assistantMsgs.slice(-recentCount);
    const older = assistantMsgs.slice(0, -recentCount);

    const olderSummary = older
        .map(m => {
            const mentor = mentors.find(mt => mt.id === m.mentorId);
            const name = mentor ? mentor.name : m.mentorId;
            // 取前50字做摘要
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

// SSE 事件类型
export type GroupSSEPayload =
    | { type: 'mentor_start'; mentorId: string; mentorName: string; mentorAvatar: string; mentorColor: string; round: number }
    | { type: 'mentor_chunk'; content: string }
    | { type: 'mentor_end'; mentorId: string }
    | { type: 'round_end'; round: number }
    | { type: 'done' }
    | { type: 'error'; message: string };
