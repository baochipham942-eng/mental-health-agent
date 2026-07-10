import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { orchestrateGroupChat, type GroupIntent, type GroupMode, type GroupSSEPayload } from '@/lib/ai/group/orchestrator';
import { guardInput, getBlockedResponse } from '@/lib/ai/guardrails';
import { prisma } from '@/lib/db/prisma';
import { extractLabInsights } from '@/lib/memory/lab-extractor';
import { runWithTrace } from '@/lib/observability/trace-context';
import { updateTrace } from '@/lib/observability/langfuse';
import { logInfo, logWarn, logError } from '@/lib/observability/logger';
import { groupBodySchema } from '@/lib/api/chat-request-schema';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { runAfterResponse } from '@/lib/api/run-after-response';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 圆桌成本红线：单请求 4 人辩论 ≈13 次 LLM 调用，按 userId 双层限流
const GROUP_REQUESTS_PER_MINUTE = 10;   // 内存级（单实例内即时生效）
const GROUP_SESSIONS_PER_HOUR = 10;     // DB 级开桌上限（实例重启/多实例下仍有效）
const GROUP_ROUNDS_PER_HOUR = 30;       // DB 级轮次上限（新开+续轮都算，堵续轮绕过）

type IncomingGroupMessage = { role: 'user' | 'assistant'; content: string; mentorId?: string; round?: number };

export async function POST(request: NextRequest) {
    const requestStartedAt = Date.now();
    return runWithTrace('group-chat', { requestStartedAt }, async () => {
    try {
        const session = await auth();
        const userId = session?.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rl = checkRateLimit(`group:${userId}`, GROUP_REQUESTS_PER_MINUTE, 60_000);
        if (!rl.success) {
            return NextResponse.json(
                { error: '操作太频繁了，稍等片刻再继续吧' },
                { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfterMs || 60_000) / 1000)) } },
            );
        }

        const body = await request.json();
        const { messages, mentorIds, mode, topic, intent = 'discuss', labSessionId: requestedLabSessionId } = body as {
            messages: IncomingGroupMessage[];
            mentorIds: string[];
            mode: GroupMode;
            topic?: string;
            intent?: GroupIntent;
            labSessionId?: string;
        };

        if (!mentorIds || !Array.isArray(mentorIds) || mentorIds.length < 2 || mentorIds.length > 4) {
            return NextResponse.json({ error: '需要选择 2-4 位大师' }, { status: 400 });
        }

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
        }

        if (intent !== 'discuss' && intent !== 'summarize') {
            return NextResponse.json({ error: '不支持的圆桌操作' }, { status: 400 });
        }

        // 请求体校验：role 枚举（拒 system）、单条/总量钳制、mentorId 白名单、mode 枚举
        const bodyCheck = groupBodySchema.safeParse(body);
        if (!bodyCheck.success) {
            const issue = bodyCheck.error.issues[0];
            logWarn('group-chat-request-invalid', { path: issue?.path?.join('.'), code: issue?.code });
            return NextResponse.json({ error: '请求参数不合法' }, { status: 400 });
        }

        // 全部 user 消息逐条过输入护栏：首开桌时客户端可自带多条历史，
        // 只查最后一条会让有害内容藏在前面的条目里直进 mentor prompt（续轮历史来自 DB 已可信，但 messages 本就只含新消息）
        for (const m of messages) {
            if (m.role !== 'user') continue;
            const guard = guardInput(m.content);
            if (!guard.safe) {
                return new NextResponse(getBlockedResponse(guard.reason), { status: 200 });
            }
        }

        // DB 级轮次限流：开桌数上限只拦新开桌，续轮同样是完整一轮辩论（≈13 次 LLM 调用），
        // 必须一并计数，否则拿到 labSessionId 后可无限续轮绕过成本红线
        const hourAgoForRounds = new Date(Date.now() - 60 * 60 * 1000);
        const recentRounds = await prisma.labMessage.count({
            where: {
                role: 'user',
                createdAt: { gte: hourAgoForRounds },
                session: { userId, labType: 'group' },
            },
        });
        if (recentRounds >= GROUP_ROUNDS_PER_HOUR) {
            return NextResponse.json(
                { error: '这一小时聊得有点多啦，休息一下稍后再来' },
                { status: 429 },
            );
        }

        // 会话定位：续轮复用同一场圆桌（服务端从 DB 回灌历史），否则新开一桌
        let labSessionId: string;
        let groupConfig: Record<string, unknown> = { mentorIds, mode, topic };
        let historyMessages: IncomingGroupMessage[] = [];
        let isNewSession = false;

        if (requestedLabSessionId) {
            const existing = await prisma.labSession.findUnique({
                where: { id: requestedLabSessionId },
                select: { id: true, userId: true, labType: true, groupConfig: true },
            });
            if (!existing || existing.userId !== userId || existing.labType !== 'group') {
                return NextResponse.json({ error: '圆桌会话不存在' }, { status: 404 });
            }
            labSessionId = existing.id;
            groupConfig = (existing.groupConfig as Record<string, unknown>) || groupConfig;
            const prior = await prisma.labMessage.findMany({
                where: { sessionId: labSessionId, role: { in: ['user', 'assistant'] } },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                select: { role: true, content: true, mentorId: true, round: true },
            });
            historyMessages = prior.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
                mentorId: m.mentorId ?? undefined,
                round: m.round ?? undefined,
            }));
        } else {
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const recentSessions = await prisma.labSession.count({
                where: { userId, labType: 'group', createdAt: { gte: hourAgo } },
            });
            if (recentSessions >= GROUP_SESSIONS_PER_HOUR) {
                return NextResponse.json({ error: '这一小时开的圆桌有点多啦，休息一下稍后再来' }, { status: 429 });
            }
            const titleSource = topic || messages.find(m => m.role === 'user')?.content || '';
            const created = await prisma.labSession.create({
                data: {
                    userId,
                    labType: 'group',
                    groupConfig: groupConfig as any,
                    title: titleSource.slice(0, 30) + (titleSource.length > 30 ? '...' : ''),
                    messageCount: 0,
                },
            });
            labSessionId = created.id;
            isNewSession = true;
        }

        // 圆桌跨会话记忆：读取用户既往洞察注入开场白与大师 prompt（fail-open，读不到不阻塞开桌）
        let userInsights: string[] = [];
        try {
            const { findProfileMemoriesTop } = await import('@/lib/memory/data-bridge');
            const memories = await findProfileMemoriesTop(userId, 5);
            userInsights = memories.map(m => m.content);
        } catch (e: any) {
            logError('group-chat-memory-load-failed', { error: e?.message });
        }

        // 收集所有 SSE 事件用于持久化
        const allEvents: GroupSSEPayload[] = [];
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                let aborted = false;
                try {
                    if (isNewSession) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'lab_session', labSessionId })}\n\n`));
                    }

                    const generator = orchestrateGroupChat({
                        mentorIds,
                        mode,
                        topic,
                        messages: [...historyMessages, ...messages],
                        intent,
                        userInsights,
                        signal: request.signal,
                    });

                    for await (const event of generator) {
                        if (request.signal.aborted) {
                            aborted = true;
                            break; // 停止拉取 generator，剩余 mentor 不再调用
                        }
                        allEvents.push(event);
                        // 不向客户端发送 phase_metrics 和 stance_analysis 内部事件
                        if (event.type !== 'phase_metrics' && event.type !== 'stance_analysis') {
                            const data = `data: ${JSON.stringify(event)}\n\n`;
                            controller.enqueue(encoder.encode(data));
                        }
                    }
                } catch (error: any) {
                    if (request.signal.aborted) {
                        aborted = true;
                    } else {
                        logError('group-chat-stream-error', { error: error.message });
                        try {
                            const errorEvent = `data: ${JSON.stringify({ type: 'error', message: error.message || '服务器错误' })}\n\n`;
                            controller.enqueue(encoder.encode(errorEvent));
                        } catch { /* 客户端已断开 */ }
                    }
                } finally {
                    try {
                        controller.close();
                    } catch { /* 客户端断开后 close 会抛，忽略 */ }

                    if (aborted) {
                        logInfo('group-chat-aborted', { labSessionId, eventsSoFar: allEvents.length });
                    }

                    // serverless 冻结安全的持久化（错题本 #16：裸 Promise 会在响应结束后被冻结掐死）
                    runAfterResponse(async () => {
                        try {
                            await persistGroupSession({
                                labSessionId,
                                userId,
                                mentorIds,
                                groupConfig,
                                newMessages: messages,
                                events: allEvents,
                                aborted,
                            });
                        } catch (e: any) {
                            logError('group-chat-persist-failed', { error: e?.message });
                        }
                    });
                }
            },
        });

        // 更新 Langfuse trace 元数据
        const { getCurrentTrace } = await import('@/lib/observability/trace-context');
        const reqTrace = getCurrentTrace()?.trace;
        if (reqTrace) {
            updateTrace(reqTrace, {
                metadata: {
                    userId, mentorIds, mode, topic, labSessionId,
                    mentorCount: mentorIds.length,
                    totalDurationMs: Date.now() - requestStartedAt,
                },
            });
        }

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: any) {
        logError('group-chat-api-error', { error: error.message });
        return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
    }
    }); // end runWithTrace
}

/**
 * 将本次请求的增量（新用户消息 + 本轮 SSE 事件）追加到已有 LabSession。
 * 会话本体在 route 入口创建/校验，这里只做 append，不再整史重存。
 */
async function persistGroupSession(params: {
    labSessionId: string;
    userId: string;
    mentorIds: string[];
    groupConfig: Record<string, unknown>;
    newMessages: Array<{ role: string; content: string }>;
    events: GroupSSEPayload[];
    aborted: boolean;
}) {
    const { labSessionId, userId, mentorIds, groupConfig, newMessages, events, aborted } = params;

    // 提取 phase metrics 汇总
    const phaseMetrics: Record<string, number> = {};
    for (const e of events) {
        if (e.type === 'phase_metrics') {
            phaseMetrics[e.phase] = e.durationMs;
        }
    }

    // 提取 stance analysis
    let stanceData: any = null;
    for (const e of events) {
        if (e.type === 'stance_analysis') {
            stanceData = e.stances;
        }
    }

    // 将 SSE 事件转化为 LabMessage 记录
    const labMessages: Array<{
        sessionId: string;
        role: string;
        content: string;
        mentorId: string | null;
        round: number | null;
        meta: any;
    }> = [];

    // 先保存本次请求新增的用户消息（历史消息已在此前请求中落库）
    for (const msg of newMessages) {
        if (msg.role === 'user') {
            labMessages.push({
                sessionId: labSessionId,
                role: 'user',
                content: msg.content,
                mentorId: null,
                round: null,
                meta: null,
            });
        }
    }

    // 处理 SSE 事件
    let currentMentorId: string | null = null;
    let currentMentorContent = '';
    let currentRound: number | null = null;

    for (const event of events) {
        switch (event.type) {
            case 'mentor_start':
                currentMentorId = event.mentorId;
                currentMentorContent = '';
                currentRound = event.round;
                break;

            case 'mentor_chunk':
                currentMentorContent += event.content;
                break;

            case 'mentor_end':
                if (currentMentorId && currentMentorContent) {
                    labMessages.push({
                        sessionId: labSessionId,
                        role: 'assistant',
                        content: currentMentorContent,
                        mentorId: currentMentorId,
                        round: currentRound,
                        meta: null,
                    });
                }
                currentMentorId = null;
                currentMentorContent = '';
                break;

            case 'mentor_pass':
                // 弃权是轻量状态，不作为发言持久化（回放时前情回顾也不需要它）
                break;

            case 'moderator':
                labMessages.push({
                    sessionId: labSessionId,
                    role: 'moderator',
                    content: event.content,
                    mentorId: null,
                    round: null,
                    meta: {
                        action: event.action,
                        targetMentorId: event.targetMentorId || null,
                        ...(event.decision ? { decision: event.decision } : {}),
                    },
                });
                break;

            case 'synthesis':
                labMessages.push({
                    sessionId: labSessionId,
                    role: 'synthesis',
                    content: event.content,
                    mentorId: null,
                    round: null,
                    meta: { stanceAnalysis: stanceData, phaseMetrics },
                });
                break;
        }
    }

    if (labMessages.length === 0 && !aborted) return;

    if (labMessages.length > 0) {
        await prisma.labMessage.createMany({ data: labMessages });
    }
    await prisma.labSession.update({
        where: { id: labSessionId },
        data: {
            messageCount: { increment: labMessages.length },
            ...(aborted ? { groupConfig: { ...groupConfig, aborted: true } as any } : {}),
        },
    });

    // 提取心理洞察（只喂本次增量，服务端统一提取，前端不再重复触发）
    // 本函数已运行在 after() 内，await 保证 serverless 冻结前跑完
    const allMsgs = labMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

    if (allMsgs.length >= 2) {
        try {
            const count = await extractLabInsights(userId, allMsgs, 'mentor', mentorIds.join(','));
            if (count > 0) logInfo('group-chat-insights-extracted', { count });
        } catch (e: any) {
            logError('group-chat-insight-extraction-failed', { error: e?.message });
        }
    }
}
