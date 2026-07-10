import { NextRequest, NextResponse } from 'next/server';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import type { ChatUIMessage, ChatUIChunk } from '@/types/chat-ui-message';
import { auth } from '@/auth';
import { streamChatCompletion, ChatMessage } from '@/lib/ai/deepseek';
import { memoryContextService } from '@/lib/memory';
import { getMBTIPersona } from '@/lib/ai/mbti/personas';
import { mbtiBodySchema } from '@/lib/api/chat-request-schema';
import { guardInput, getBlockedResponse, createOutputGuardStream } from '@/lib/ai/guardrails';
import { runWithTrace, getCurrentTrace } from '@/lib/observability/trace-context';
import { updateTrace } from '@/lib/observability/langfuse';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    return runWithTrace('mbti-chat', {}, async () => {
    try {
        const session = await auth();
        const userId = session?.user?.id;

        // Only allow authenticated users
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        // 请求体校验：role 只允许 user/assistant（伪造 system 直接拒）、长度/条数钳制
        const bodyCheck = mbtiBodySchema.safeParse(body);
        if (!bodyCheck.success) {
            return NextResponse.json({ error: '请求参数不合法' }, { status: 400 });
        }
        const { messages, mbtiType } = bodyCheck.data;

        // Vercel AI SDK sends 'messages' array. Get the last message as current input.
        const lastMessage = messages[messages.length - 1];
        const messageContent = lastMessage?.content;

        if (!messageContent || messageContent.trim().length === 0) {
            return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
        }

        const persona = getMBTIPersona(mbtiType ?? '');
        if (!persona) {
            return NextResponse.json({ error: 'MBTI persona not found' }, { status: 400 });
        }

        // 1. Input Guard
        const inputGuard = guardInput(messageContent);
        if (!inputGuard.safe) {
            return new NextResponse(getBlockedResponse(inputGuard.reason), { status: 200 });
        }

        // 2. 记忆上下文检索（只读）
        let memoryContext = '';
        let memoryRetrieved = false;
        try {
            const { injectedText } = await memoryContextService.getContext(userId, messageContent);
            if (injectedText) {
                memoryContext = `\n\n【用户背景记忆（仅供参考，无需主动提及，除非用户相关）】\n${injectedText}`;
                memoryRetrieved = true;
            }
        } catch (e) {
            console.error('[MBTIChat] Failed to retrieve memories:', e);
        }

        // 3. Construct Prompts
        const systemPrompt = `${persona.systemPrompt}
    
${memoryContext}

⚠️ **重要约束**：
- 沉浸在你的 MBTI 人格设定中。
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
                    userId, mbtiType,
                    personaName: persona.name,
                    messageCount: messages.length,
                },
            });
        }

        // 4. Stream Response（v6 UIMessageStream — 顺带补 persona / memory part）
        const stream = createUIMessageStream<ChatUIMessage>({
            execute: async ({ writer }) => {
                writer.write({
                    type: 'data-persona',
                    data: { mode: persona.name, reasoning: `MBTI: ${mbtiType}` },
                });
                if (memoryRetrieved) {
                    writer.write({ type: 'data-memory', data: { retrieved: 'yes' } });
                }

                const result = await streamChatCompletion(coreMessages, {
                    temperature: 0.9,
                    max_tokens: 800,
                });
                writer.merge(
                    (result.toUIMessageStream() as ReadableStream<ChatUIChunk>)
                        .pipeThrough(createOutputGuardStream<ChatUIChunk>({ logContext: { route: 'mbti' } })),
                );
            },
            onError: (error) => {
                console.error('MBTI stream error:', error);
                return error instanceof Error ? error.message : 'MBTI 处理失败';
            },
        });

        return createUIMessageStreamResponse({ stream });

    } catch (error: any) {
        console.error('MBTI Chat API Error:', error);
        return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
    }
    }); // end runWithTrace
}
