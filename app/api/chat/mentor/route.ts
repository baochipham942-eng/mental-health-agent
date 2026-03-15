import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { streamChatCompletion, ChatMessage } from '@/lib/ai/deepseek';
import { memoryContextService } from '@/lib/memory';
import { getMentor } from '@/lib/ai/mentors/personas';
import { guardInput, getBlockedResponse } from '@/lib/ai/guardrails';
import { prisma } from '@/lib/db/prisma';
import { extractLabInsights } from '@/lib/memory/lab-extractor';
import { runWithTrace, getCurrentTrace } from '@/lib/observability/trace-context';
import { updateTrace } from '@/lib/observability/langfuse';

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
        const { messages, mentorId, customMentor, sessionId: clientSessionId } = body;

        const lastMessage = messages?.[messages.length - 1];
        const messageContent = lastMessage?.content;

        if (!messageContent || messageContent.trim().length === 0) {
            return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
        }

        let mentor = getMentor(mentorId);
        if (!mentor && customMentor) {
            mentor = customMentor;
        }
        if (!mentor) {
            return NextResponse.json({ error: 'Mentor not found' }, { status: 400 });
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
            .catch(e => console.error('[MentorChat] Failed to retrieve memories:', e));

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

        const result = await streamChatCompletion(coreMessages, {
            temperature: 0.9,
            max_tokens: 800,
        });

        // 6. Collect full reply for persistence (intercept stream)
        const originalResponse = result.toDataStreamResponse();
        const originalBody = originalResponse.body;
        if (!originalBody) {
            return originalResponse;
        }

        let fullReply = '';
        const reader = originalBody.getReader();
        const decoder = new TextDecoder();

        const interceptedStream = new ReadableStream({
            async start(controller) {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        // Forward chunk to client
                        controller.enqueue(value);
                        // Parse text content from stream
                        const chunk = decoder.decode(value, { stream: true });
                        for (const line of chunk.split('\n')) {
                            if (line.startsWith('0:')) {
                                try { fullReply += JSON.parse(line.slice(2)); } catch {}
                            }
                        }
                    }
                } finally {
                    controller.close();

                    // 7. Async: Save assistant message + extract insights
                    const trimmedReply = fullReply.trim();
                    if (trimmedReply && labSessionId) {
                        // Save assistant message
                        prisma.labMessage.create({
                            data: {
                                sessionId: labSessionId,
                                role: 'assistant',
                                content: trimmedReply,
                                mentorId: mentor!.id,
                                meta: { mentorId: mentor!.id, memoryRetrieved },
                            },
                        }).then(() =>
                            // Update message count
                            prisma.labSession.update({
                                where: { id: labSessionId! },
                                data: { messageCount: { increment: 2 } }, // user + assistant
                            })
                        ).catch(e => console.error('[MentorChat] Failed to save assistant message:', e));

                        // Extract insights (async, non-blocking)
                        const allMessages = [
                            ...messages.map((m: any) => ({ role: m.role, content: m.content })),
                            { role: 'assistant', content: trimmedReply },
                        ];
                        extractLabInsights(userId, allMessages, 'mentor', mentorId || 'custom')
                            .then(count => {
                                if (count > 0) console.log(`[MentorChat] Extracted ${count} insights`);
                            })
                            .catch(e => console.error('[MentorChat] Insight extraction failed:', e));
                    }
                }
            },
        });

        const headers = new Headers(originalResponse.headers);
        if (labSessionId) {
            headers.set('X-Lab-Session-Id', labSessionId);
        }

        return new Response(interceptedStream, {
            status: originalResponse.status,
            statusText: originalResponse.statusText,
            headers,
        });

    } catch (error: any) {
        console.error('Mentor Chat API Error:', error);
        return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
    }
    }); // end runWithTrace
}
