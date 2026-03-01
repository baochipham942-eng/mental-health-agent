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
        const { messages, contextType, contextId, customName, groupConfig } = body;

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
            let labType: string = 'wisdom';
            if (contextType === 'mbti') {
                labType = 'mirrors';
            } else if (contextType === 'group') {
                labType = 'group';
            } else if (customName) {
                labType = 'custom';
            }

            // 创建 LabSession 记录
            const labSession = await prisma.labSession.create({
                data: {
                    userId,
                    labType,
                    mentorId: labType === 'wisdom' ? contextId : null,
                    mbtiType: labType === 'mirrors' ? contextId : null,
                    customName: labType === 'custom' ? customName : null,
                    groupConfig: labType === 'group' ? (groupConfig || null) : null,
                    title: title || null,
                    messageCount,
                },
            });

            // 群组对话：批量保存消息（带 mentorId 和 round）
            if (labType === 'group' && messages.length > 0) {
                // 从消息内容中解析大师标记
                const labMessages = messages.map((m: any, index: number) => {
                    let mentorId: string | null = null;
                    let content = m.content;

                    // 解析 "[大师名]: 内容" 格式
                    if (m.role === 'assistant' && m.mentorId) {
                        mentorId = m.mentorId;
                    }

                    return {
                        sessionId: labSession.id,
                        role: m.role,
                        content,
                        mentorId,
                        round: m.round || null,
                    };
                });

                await prisma.labMessage.createMany({
                    data: labMessages,
                });
            }
        }

        // 提取心理洞察
        const extractType = contextType === 'group' ? 'mentor' : contextType;
        const count = await extractLabInsights(userId, messages, extractType, contextId);

        return NextResponse.json({ success: true, count, sessionRecorded: messageCount > 0 });

    } catch (error: any) {
        console.error('Lab Extraction API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
