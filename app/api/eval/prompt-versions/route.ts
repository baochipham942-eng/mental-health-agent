/**
 * Sprint 3: Prompt 版本管理 API
 * 列出所有版本及其评分聚合
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
    const { admin: isAdmin } = await checkAdmin();
    if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const versions = await prisma.promptVersion.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                evaluations: {
                    where: { overallGrade: { notIn: ['EVALUATING', 'FAILED'] } },
                    select: { overallScore: true },
                },
            },
        });

        const result = versions.map(v => ({
            id: v.id,
            name: v.name,
            hash: v.hash,
            content: v.content,
            parentId: v.parentId,
            metadata: v.metadata,
            createdAt: v.createdAt.toISOString(),
            evalCount: v.evaluations.length,
            avgScore: v.evaluations.length > 0
                ? Math.round((v.evaluations.reduce((s, e) => s + e.overallScore, 0) / v.evaluations.length) * 10) / 10
                : 0,
        }));

        return NextResponse.json({ versions: result });
    } catch (e: any) {
        console.error('[PromptVersions] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
