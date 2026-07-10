import { NextRequest, NextResponse } from 'next/server';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import type { ChatUIMessage, ChatUIChunk } from '@/types/chat-ui-message';
import { auth } from '@/auth';
import { streamChatCompletion, ChatMessage } from '@/lib/ai/deepseek';
import { memoryContextService } from '@/lib/memory';
import { getMentor, MentorPersona } from '@/lib/ai/mentors/personas';
import { mentorBodySchema } from '@/lib/api/chat-request-schema';
import { guardInput, getBlockedResponse, createOutputGuardStream } from '@/lib/ai/guardrails';
import { prisma } from '@/lib/db/prisma';
import { extractLabInsights } from '@/lib/memory/lab-extractor';
import { runWithTrace, getCurrentTrace } from '@/lib/observability/trace-context';
import { updateTrace } from '@/lib/observability/langfuse';
import { logInfo, logError } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    return runWithTrace('mentor-chat', {}, async () => {
    try {
        const session = await auth();
        const userId = session?.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        // 请求体校验：role 只允许 user/assistant（伪造 system 直接拒）、
        // 长度/条数钳制、customMentor 收敛为服务端消费的字段
        const bodyCheck = mentorBodySchema.safeParse(body);
        if (!bodyCheck.success) {
            const issue = bodyCheck.error.issues[0];
            logError('mentor-chat-request-invalid', { path: issue?.path?.join('.'), code: issue?.code });
            return NextResponse.json({ error: '请求参数不合法' }, { status: 400 });
        }
        const { messages, mentorId, customMentor, sessionId: clientSessionId } = bodyCheck.data;

        const lastMessage = messages[messages.length - 1];
        const messageContent = lastMessage?.content;

        if (!messageContent || messageContent.trim().length === 0) {
            return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
        }

        let mentor: Pick<MentorPersona, 'id' | 'name' | 'systemPrompt'> | undefined =
            getMentor(mentorId ?? '');
        if (!mentor && customMentor) {
            mentor = { id: customMentor.id ?? 'custom', name: customMentor.name, systemPrompt: customMentor.systemPrompt };
        }
        if (!mentor) {
            return NextResponse.json({ error: 'Mentor not found' }, { status: 400 });
        }

        // 会话信任边界：客户端传入 sessionId 时校验归属与类型，不属于当前用户则 404
        if (clientSessionId) {
            const owned = await prisma.labSession.findUnique({
                where: { id: clientSessionId },
                select: { userId: true, labType: true },
            });
            const expectedLabType = customMentor ? 'custom' : 'wisdom';
            if (!owned || owned.userId !== userId || owned.labType !== expectedLabType) {
                return NextResponse.json({ error: '会话不存在' }, { status: 404 });
            }
        }

        // 1. Input Guard
        const inputGuard = guardInput(messageContent);
        if (!inputGuard.safe) {
            return new NextResponse(getBlockedResponse(inputGuard.reason), { status: 200 });
        }

        // 2-4. 并行执行：记忆检索 + LabSession 创建/保存用户消息
        let memoryContext = '';
        let memoryRetrieved = false;
        let labSessionId = clientSessionId || null;

        const memoryPromise = memoryContextService.getContext(userId, messageContent)
            .then(({ injectedText }) => {
                if (injectedText) {
                    memoryContext = `\n\n【用户背景记忆（仅供参考，无需主动提及，除非用户相关）】\n${injectedText}`;
                    memoryRetrieved = true;
                }
            })
            .catch(e => logError('mentor-chat-memory-retrieval-failed', { error: e?.message }));

        const dbPromise = (async () => {
            if (!labSessionId) {
                const firstUserMsg = messages.find((m: any) => m.role === 'user')?.content || '';
                const title = firstUserMsg.slice(0, 20) + (firstUserMsg.length > 20 ? '...' : '');
                const labType = customMentor ? 'custom' : 'wisdom';
                const labSession = await prisma.labSession.create({
                    data: {
                        userId, labType,
                        mentorId: labType === 'wisdom' ? mentorId : null,
                        customName: customMentor?.name || null,
                        title, messageCount: 0,
                    },
                });
                labSessionId = labSession.id;
            }
            await prisma.labMessage.create({
                data: {
                    sessionId: labSessionId!,
                    role: 'user',
                    content: messageContent,
                    meta: { mentorId: mentor.id },
                },
            });
        })();

        await Promise.all([memoryPromise, dbPromise]);

        // 5. Construct Prompts & Stream
        const systemPrompt = `${mentor.systemPrompt}

${memoryContext}

⚠️ **重要约束**：
- 保持角色一致性，不要掉书袋，要像人一样对话。
- 你的回答应该引发思考，而不是仅仅给予安慰。
- 如果用户表达了自杀或极端危机倾向，请立即暂时脱离角色，以严肃、关切的口吻建议寻求专业医生帮助，并提供危机干预热线。`;

        const coreMessages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...messages.map((m: any) => ({
                role: m.role as 'user' | 'assistant' | 'system',
                content: m.content
            }))
        ];

        // Langfuse trace metadata
        const reqTrace = getCurrentTrace()?.trace;
        if (reqTrace) {
            updateTrace(reqTrace, {
                metadata: {
                    userId, mentorId: mentor.id, mentorName: mentor.name,
                    labSessionId, memoryRetrieved,
                    isCustomMentor: !!customMentor,
                    messageCount: messages.length,
                },
            });
        }

        // 6. v6 UIMessageStream — 顺带写 persona/memory part，
        //    用 onFinish 直接拿 fullReply（替代旧的手动 stream 拦截）
        let fullReply = '';

        const stream = createUIMessageStream<ChatUIMessage>({
            execute: async ({ writer }) => {
                writer.write({
                    type: 'data-persona',
                    data: {
                        mode: mentor!.name,
                        reasoning: customMentor ? 'custom mentor' : `wisdom: ${mentor!.id}`,
                    },
                });
                if (memoryRetrieved) {
                    writer.write({ type: 'data-memory', data: { retrieved: 'yes' } });
                }

                const result = await streamChatCompletion(coreMessages, {
                    temperature: 0.9,
                    max_tokens: 800,
                    onFinish: async (text) => { fullReply = text; },
                });
                writer.merge(
                    (result.toUIMessageStream() as ReadableStream<ChatUIChunk>)
                        .pipeThrough(createOutputGuardStream<ChatUIChunk>({ logContext: { route: 'mentor' } })),
                );
            },
            onFinish: async () => {
                // 7. Async: Save assistant message + extract insights
                const trimmedReply = fullReply.trim();
                if (trimmedReply && labSessionId) {
                    prisma.labMessage.create({
                        data: {
                            sessionId: labSessionId,
                            role: 'assistant',
                            content: trimmedReply,
                            mentorId: mentor!.id,
                            meta: { mentorId: mentor!.id, memoryRetrieved },
                        },
                    }).then(() =>
                        prisma.labSession.update({
                            where: { id: labSessionId! },
                            data: { messageCount: { increment: 2 } },
                        }),
                    ).catch(e => logError('mentor-chat-save-failed', { error: e?.message }));

                    const allMessages = [
                        ...messages.map((m: any) => ({ role: m.role, content: m.content })),
                        { role: 'assistant', content: trimmedReply },
                    ];
                    extractLabInsights(userId, allMessages, 'mentor', mentorId || 'custom')
                        .then(count => {
                            if (count > 0) logInfo('mentor-chat-insights-extracted', { count });
                        })
                        .catch(e => logError('mentor-chat-insight-extraction-failed', { error: e?.message }));
                }
            },
            onError: (error) => {
                logError('mentor-chat-stream-error', {
                    error: error instanceof Error ? error.message : String(error),
                });
                return error instanceof Error ? error.message : '导师对话处理失败';
            },
        });

        const headers: Record<string, string> = {};
        if (labSessionId) {
            headers['X-Lab-Session-Id'] = labSessionId;
        }

        return createUIMessageStreamResponse({ stream, headers });

    } catch (error: any) {
        logError('mentor-chat-api-error', { error: error.message });
        return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
    }
    }); // end runWithTrace
}
