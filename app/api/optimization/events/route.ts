/**
 * Optimization Events API
 * 
 * GET - 获取优化事件列表（按类型筛选）
 * PATCH - 更新事件状态
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/optimization/events
 * 
 * Query params:
 * - type: 'LOW_SCORE' | 'NEGATIVE_FEEDBACK' | 'STUCK_LOOP' | 'ALL'
 * - status: 'PENDING' | 'PROCESSED' | 'IGNORED' | 'ALL'
 * - page: number (default 1)
 * - pageSize: number (default 20)
 */
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'ALL';
    const status = searchParams.get('status') || 'PENDING';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    try {
        const where: any = {};

        if (type !== 'ALL') {
            where.type = type;
        }

        if (status !== 'ALL') {
            where.status = status;
        }

        const [events, total] = await Promise.all([
            prisma.optimizationEvent.findMany({
                where,
                orderBy: [
                    { severity: 'desc' },
                    { createdAt: 'desc' }
                ],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.optimizationEvent.count({ where })
        ]);

        // 统计各类型数量
        const stats = await prisma.optimizationEvent.groupBy({
            by: ['type'],
            where: { status: 'PENDING' },
            _count: true,
        });

        const statsMap = {
            LOW_SCORE: 0,
            NEGATIVE_FEEDBACK: 0,
            STUCK_LOOP: 0,
        };
        stats.forEach(s => {
            if (s.type in statsMap) {
                statsMap[s.type as keyof typeof statsMap] = s._count;
            }
        });

        return NextResponse.json({
            events,
            total,
            page,
            pageSize,
            stats: statsMap,
        });
    } catch (error: any) {
        console.error('[Events API] GET failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/optimization/events
 * 
 * Body: { eventId: string, status: 'PROCESSED' | 'IGNORED', resolution?: string }
 */
export async function PATCH(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { eventId, status, resolution } = body;

        if (!eventId || !['PROCESSED', 'IGNORED'].includes(status)) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }

        const updated = await prisma.optimizationEvent.update({
            where: { id: eventId },
            data: {
                status,
                resolution,
                processedAt: new Date(),
                processedBy: session.user.id,
            }
        });

        return NextResponse.json({ success: true, event: updated });
    } catch (error: any) {
        console.error('[Events API] PATCH failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
