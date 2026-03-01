import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { orchestrateGroupChat, GroupMode } from '@/lib/ai/group/orchestrator';
import { guardInput, getBlockedResponse } from '@/lib/ai/guardrails';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 群组对话需要更长超时

export async function POST(request: NextRequest) {
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

        // 验证参数
        if (!mentorIds || !Array.isArray(mentorIds) || mentorIds.length < 2 || mentorIds.length > 4) {
            return NextResponse.json({ error: '需要选择 2-4 位大师' }, { status: 400 });
        }

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
        }

        // 安全检查最后一条用户消息
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        if (lastUserMsg) {
            const guard = guardInput(lastUserMsg.content);
            if (!guard.safe) {
                return new NextResponse(getBlockedResponse(guard.reason), { status: 200 });
            }
        }

        // 创建 SSE 流
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
                        const data = `data: ${JSON.stringify(event)}\n\n`;
                        controller.enqueue(encoder.encode(data));
                    }
                } catch (error: any) {
                    console.error('[GroupChat API] Stream error:', error);
                    const errorEvent = `data: ${JSON.stringify({ type: 'error', message: error.message || '服务器错误' })}\n\n`;
                    controller.enqueue(encoder.encode(errorEvent));
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: any) {
        console.error('Group Chat API Error:', error);
        return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
    }
}
