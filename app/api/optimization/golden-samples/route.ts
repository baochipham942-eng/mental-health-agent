/**
 * Golden Samples API
 * 
 * GET - 获取用户点赞的高质量回复（黄金样本）
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/optimization/golden-samples
 * 
 * Query params:
 * - page: number (default 1)
 * - pageSize: number (default 20)
 * - export: boolean (if true, return all samples for export)
 */
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const isExport = searchParams.get('export') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    try {
        // 查询所有点赞的反馈（rating = 1）
        const where = { rating: 1 };

        const [feedbacks, total] = await Promise.all([
            prisma.messageFeedback.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: isExport ? 0 : (page - 1) * pageSize,
                take: isExport ? 1000 : pageSize, // 导出最多1000条
                include: {
                    message: {
                        select: {
                            id: true,
                            content: true,
                            conversationId: true,
                        }
                    }
                }
            }),
            prisma.messageFeedback.count({ where })
        ]);

        const samples = feedbacks.map(f => ({
            id: f.id,
            conversationId: f.message.conversationId,
            messageId: f.messageId,
            content: f.message.content,
            reason: f.reason,
            createdAt: f.createdAt.toISOString(),
        }));

        // 导出格式：适合作为 Few-Shot 示例
        if (isExport) {
            return NextResponse.json({
                samples: samples.map(s => ({
                    role: 'assistant',
                    content: s.content,
                    // 元数据
                    _meta: {
                        original_id: s.messageId,
                        user_reason: s.reason,
                        collected_at: s.createdAt,
                    }
                })),
                total: samples.length,
                exportedAt: new Date().toISOString(),
            });
        }

        return NextResponse.json({
            samples,
            total,
            page,
            pageSize,
        });
    } catch (error: any) {
        console.error('[GoldenSamples API] GET failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
