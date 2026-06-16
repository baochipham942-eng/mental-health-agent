import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { isAdmin as checkAdminAuth } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/crisis - 获取危机升级列表（仅管理员）
 * 查询参数: ?status=PENDING
 */
export async function GET(request: NextRequest) {
    try {
        const { admin: isAdminUser } = await checkAdminAuth();

        if (!isAdminUser) {
            return NextResponse.json({ error: '无权限' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 100);

        const where: any = {};
        if (status) {
            where.status = status;
        }

        const escalations = await prisma.crisisEscalation.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { id: true, username: true, nickname: true },
                },
            },
            take: limit,
        });

        return NextResponse.json({ escalations });
    } catch (error: any) {
        console.error('[API/Crisis] GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/crisis - 创建危机升级记录
 * Body: { userId, conversationId, triggerMessage, riskLevel, safetyScore }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: '未登录' }, { status: 401 });
        }

        const { userId, conversationId, triggerMessage, riskLevel, safetyScore } = await request.json();

        if (!userId || !conversationId || !triggerMessage || !riskLevel || safetyScore === undefined) {
            return NextResponse.json({ error: '缺少必需参数' }, { status: 400 });
        }

        if (!['urgent', 'crisis'].includes(riskLevel)) {
            return NextResponse.json({ error: '无效的风险等级，必须为 urgent 或 crisis' }, { status: 400 });
        }

        const escalation = await prisma.crisisEscalation.create({
            data: {
                userId: session.user.id,
                conversationId,
                triggerMessage,
                riskLevel,
                safetyScore,
            },
        });

        return NextResponse.json({ escalation }, { status: 201 });
    } catch (error: any) {
        console.error('[API/Crisis] POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/crisis - 更新危机升级状态（仅管理员）
 * Body: { id, status, resolution? }
 */
export async function PATCH(request: NextRequest) {
    try {
        const { admin: isAdminUser } = await checkAdminAuth();

        if (!isAdminUser) {
            return NextResponse.json({ error: '无权限' }, { status: 403 });
        }

        const { id, status, resolution } = await request.json();

        if (!id || !status) {
            return NextResponse.json({ error: '缺少必需参数' }, { status: 400 });
        }

        const validStatuses = ['PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'];
        if (!validStatuses.includes(status)) {
            return NextResponse.json(
                { error: `无效状态，必须为: ${validStatuses.join(', ')}` },
                { status: 400 }
            );
        }

        const updateData: any = { status };

        if (status === 'ACKNOWLEDGED') {
            updateData.acknowledgedAt = new Date();
        }

        if (status === 'RESOLVED' || status === 'DISMISSED') {
            updateData.resolvedAt = new Date();
            if (resolution) {
                updateData.resolution = resolution;
            }
        }

        const escalation = await prisma.crisisEscalation.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({ escalation });
    } catch (error: any) {
        console.error('[API/Crisis] PATCH error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
