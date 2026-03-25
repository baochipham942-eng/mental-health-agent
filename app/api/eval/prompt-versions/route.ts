/**
 * Sprint 3: Prompt 版本管理 API
 * 列出所有版本及其评分聚合
 */

import { NextRequest, NextResponse } from 'next/server';
import { findAllVersionsWithScores } from '@/lib/eval/data-bridge';
import { requireEvalAuth } from '../auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const denied = await requireEvalAuth(request);
    if (denied) return denied;

    try {
        const versions = await findAllVersionsWithScores();

        const result = versions.map(v => ({
            id: v.id,
            name: v.name,
            hash: v.hash,
            content: v.content,
            parentId: v.parentId,
            metadata: v.metadata,
            createdAt: v.createdAt.toISOString(),
            evalCount: v.evaluationScores.length,
            avgScore: v.evaluationScores.length > 0
                ? Math.round((v.evaluationScores.reduce((s, e) => s + e, 0) / v.evaluationScores.length) * 10) / 10
                : 0,
        }));

        return NextResponse.json({ versions: result });
    } catch (e: any) {
        console.error('[PromptVersions] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
