import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { extractLabInsights } from '@/lib/memory/lab-extractor';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const userId = session?.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { messages, contextType, contextId, customName } = body;

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
        }

        // 统计用户消息数
        const userMessages = messages.filter((m: { role: string }) => m.role === 'user');
        const messageCount = userMessages.length;

        // 只有用户发送过消息才记录会话
        if (messageCount > 0) {
            // 生成会话标题（取用户第一条消息的前20个字）
            const firstUserMessage = userMessages[0]?.content || '';
            const title = firstUserMessage.slice(0, 20) + (firstUserMessage.length > 20 ? '...' : '');

            // 确定 labType
            let labType: 'wisdom' | 'mirrors' | 'custom' = 'wisdom';
            if (contextType === 'mbti') {
                labType = 'mirrors';
            } else if (customName) {
                labType = 'custom';
            }

            // 创建 LabSession 记录
            await prisma.labSession.create({
                data: {
                    userId,
                    labType,
                    mentorId: labType === 'wisdom' ? contextId : null,
                    mbtiType: labType === 'mirrors' ? contextId : null,
                    customName: labType === 'custom' ? customName : null,
                    title: title || null,
                    messageCount,
                },
            });
        }

        // 提取心理洞察
        const count = await extractLabInsights(userId, messages, contextType, contextId);

        return NextResponse.json({ success: true, count, sessionRecorded: messageCount > 0 });

    } catch (error: any) {
        console.error('Lab Extraction API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
