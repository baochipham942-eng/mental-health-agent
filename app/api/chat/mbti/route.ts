import { NextRequest, NextResponse } from 'next/server';
import { StreamData } from 'ai';
import { auth } from '@/auth';
import { streamChatCompletion, ChatMessage } from '@/lib/ai/deepseek';
import { memoryManager } from '@/lib/memory';
import { getMBTIPersona } from '@/lib/ai/mbti/personas';
import { guardInput, getBlockedResponse } from '@/lib/ai/guardrails';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const userId = session?.user?.id;

        // Only allow authenticated users
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { messages, mbtiType } = body;

        // Vercel AI SDK sends 'messages' array. Get the last message as current input.
        const lastMessage = messages?.[messages.length - 1];
        const messageContent = lastMessage?.content;

        if (!messageContent || messageContent.trim().length === 0) {
            return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
        }

        const persona = getMBTIPersona(mbtiType);
        if (!persona) {
            return NextResponse.json({ error: 'MBTI persona not found' }, { status: 400 });
        }

        // 1. Input Guard
        const inputGuard = guardInput(messageContent);
        if (!inputGuard.safe) {
            return new NextResponse(getBlockedResponse(inputGuard.reason), { status: 200 });
        }

        // 2. Memory Context Retrieval (Read-Only)
        let memoryContext = '';
        try {
            const { contextString } = await memoryManager.getMemoriesForContext(userId, messageContent);
            if (contextString) {
                memoryContext = `\n\n【用户背景记忆（仅供参考，无需主动提及，除非用户相关）】\n${contextString}`;
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

        // 4. Stream Response
        const result = await streamChatCompletion(coreMessages, {
            temperature: 0.9,
            max_tokens: 800,
        });

        return result.toDataStreamResponse();

    } catch (error: any) {
        console.error('MBTI Chat API Error:', error);
        return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
    }
}
