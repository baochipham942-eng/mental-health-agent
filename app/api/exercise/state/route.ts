import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const VALID_EXERCISE_TYPES = [
    'grounding',
    'reframing',
    'activation',
    'empty_chair',
    'breathing',
    'meditation',
] as const;

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'abandoned'] as const;

export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: '未登录' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        const where: Record<string, unknown> = { userId: session.user.id };
        if (status) {
            where.status = status;
        }

        const states = await prisma.exerciseState.findMany({
            where,
            orderBy: { startedAt: 'desc' },
        });

        return NextResponse.json({ states });
    } catch (error: any) {
        console.error('[API/Exercise/State] GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: '未登录' }, { status: 401 });
        }

        const body = await request.json();
        const { exerciseType, totalSteps, conversationId, metadata } = body;

        if (!exerciseType || !totalSteps) {
            return NextResponse.json(
                { error: 'exerciseType 和 totalSteps 为必填' },
                { status: 400 },
            );
        }

        if (!VALID_EXERCISE_TYPES.includes(exerciseType)) {
            return NextResponse.json(
                { error: `无效的练习类型: ${exerciseType}` },
                { status: 400 },
            );
        }

        if (typeof totalSteps !== 'number' || totalSteps < 1) {
            return NextResponse.json(
                { error: 'totalSteps 必须为正整数' },
                { status: 400 },
            );
        }

        const state = await prisma.exerciseState.create({
            data: {
                userId: session.user.id,
                exerciseType,
                totalSteps,
                conversationId: conversationId ?? null,
                metadata: metadata ?? null,
            },
        });

        return NextResponse.json({ state }, { status: 201 });
    } catch (error: any) {
        console.error('[API/Exercise/State] POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: '未登录' }, { status: 401 });
        }

        const body = await request.json();
        const { id, currentStep, status, metadata } = body;

        if (!id) {
            return NextResponse.json({ error: '缺少练习状态 ID' }, { status: 400 });
        }

        const existing = await prisma.exerciseState.findUnique({
            where: { id },
            select: { userId: true },
        });

        if (!existing || existing.userId !== session.user.id) {
            return NextResponse.json({ error: '练习状态不存在或无权限' }, { status: 403 });
        }

        if (status && !VALID_STATUSES.includes(status)) {
            return NextResponse.json(
                { error: `无效的状态: ${status}` },
                { status: 400 },
            );
        }

        const data: Record<string, unknown> = {};
        if (currentStep !== undefined) data.currentStep = currentStep;
        if (status !== undefined) data.status = status;
        if (metadata !== undefined) data.metadata = metadata;

        if (status === 'completed') {
            data.completedAt = new Date();
        }

        const updated = await prisma.exerciseState.update({
            where: { id },
            data,
        });

        return NextResponse.json({ state: updated });
    } catch (error: any) {
        console.error('[API/Exercise/State] PATCH error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
