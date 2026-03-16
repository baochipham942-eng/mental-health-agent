import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { orchestrateGroupChat, GroupMode, GroupSSEPayload } from '@/lib/ai/group/orchestrator';
import { guardInput, getBlockedResponse } from '@/lib/ai/guardrails';
import { prisma } from '@/lib/db/prisma';
import { extractLabInsights } from '@/lib/memory/lab-extractor';
import { runWithTrace } from '@/lib/observability/trace-context';
import { updateTrace } from '@/lib/observability/langfuse';
import { logInfo, logError } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
    const requestStartedAt = Date.now();
    return runWithTrace('group-chat', { requestStartedAt }, async () => {
    try {
        const session = await auth();
        const userId = session?.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { messages, mentorIds, mode, topic } = body as {
            messages: Array<{ role: 'user' | 'assistant'; content: string; mentorId?: string }>;
            mentorIds: string[];
            mode: GroupMode;
            topic?: string;
        };

        if (!mentorIds || !Array.isArray(mentorIds) || mentorIds.length < 2 || mentorIds.length > 4) {
            return NextResponse.json({ error: '需要选择 2-4 位大师' }, { status: 400 });
        }

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
        }

        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        if (lastUserMsg) {
            const guard = guardInput(lastUserMsg.content);
            if (!guard.safe) {
                return new NextResponse(getBlockedResponse(guard.reason), { status: 200 });
            }
        }

        // 收集所有 SSE 事件用于持久化
        const allEvents: GroupSSEPayload[] = [];
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const generator = orchestrateGroupChat({
                        mentorIds,
                        mode,
                        topic,
                        messages,
                    });

                    for await (const event of generator) {
                        allEvents.push(event);
                        // 不向客户端发送 phase_metrics 和 stance_analysis 内部事件
                        if (event.type !== 'phase_metrics' && event.type !== 'stance_analysis') {
                            const data = `data: ${JSON.stringify(event)}\n\n`;
                            controller.enqueue(encoder.encode(data));
                        }
                    }
                } catch (error: any) {
                    logError('group-chat-stream-error', { error: error.message });
                    const errorEvent = `data: ${JSON.stringify({ type: 'error', message: error.message || '服务器错误' })}\n\n`;
                    controller.enqueue(encoder.encode(errorEvent));
                } finally {
                    controller.close();

                    // 异步持久化会话数据
                    persistGroupSession(userId, mentorIds, mode, topic, messages, allEvents)
                        .catch(e => logError('group-chat-persist-failed', { error: e?.message }));
                }
            },
        });

        // 更新 Langfuse trace 元数据
        const { getCurrentTrace } = await import('@/lib/observability/trace-context');
        const reqTrace = getCurrentTrace()?.trace;
        if (reqTrace) {
            updateTrace(reqTrace, {
                metadata: {
                    userId, mentorIds, mode, topic,
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
 * 将圆桌论道的 SSE 事件持久化到 LabSession + LabMessage
 */
async function persistGroupSession(
    userId: string,
    mentorIds: string[],
    mode: GroupMode,
    topic: string | undefined,
    originalMessages: Array<{ role: string; content: string; mentorId?: string }>,
    events: GroupSSEPayload[],
) {
    // 提取用户消息数
    const userMsgCount = originalMessages.filter(m => m.role === 'user').length;
    if (userMsgCount === 0) return;

    const firstUserMsg = originalMessages.find(m => m.role === 'user')?.content || '';
    const title = (topic || firstUserMsg).slice(0, 30) + ((topic || firstUserMsg).length > 30 ? '...' : '');

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

    // 创建 LabSession
    const labSession = await prisma.labSession.create({
        data: {
            userId,
            labType: 'group',
            groupConfig: { mentorIds, mode, topic },
            title,
            messageCount: 0,
        },
    });

    // 将 SSE 事件转化为 LabMessage 记录
    const labMessages: Array<{
        sessionId: string;
        role: string;
        content: string;
        mentorId: string | null;
        round: number | null;
        meta: any;
    }> = [];

    // 先保存用户原始消息
    for (const msg of originalMessages) {
        if (msg.role === 'user') {
            labMessages.push({
                sessionId: labSession.id,
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
                        sessionId: labSession.id,
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

            case 'moderator':
                labMessages.push({
                    sessionId: labSession.id,
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
                    sessionId: labSession.id,
                    role: 'synthesis',
                    content: event.content,
                    mentorId: null,
                    round: null,
                    meta: { stanceAnalysis: stanceData, phaseMetrics },
                });
                break;
        }
    }

    // 批量写入消息
    if (labMessages.length > 0) {
        await prisma.labMessage.createMany({ data: labMessages });
        await prisma.labSession.update({
            where: { id: labSession.id },
            data: { messageCount: labMessages.length },
        });
    }

    // 异步提取心理洞察
    const allMsgs = labMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

    if (allMsgs.length >= 2) {
        extractLabInsights(userId, allMsgs, 'mentor', mentorIds.join(','))
            .then(count => {
                if (count > 0) logInfo('group-chat-insights-extracted', { count });
            })
            .catch(e => logError('group-chat-insight-extraction-failed', { error: e?.message }));
    }
}
