/**
 * 维度统计 API
 * GET /api/eval/dimension-stats?limit=20
 * 返回最近 N 条评估的各维度平均分
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../auth-guard';
import { findRecentEvalsWithScores } from '@/lib/eval/data-bridge';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 200);

  try {
    // 获取最近评估记录（30 天内）
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const evals = findRecentEvalsWithScores(cutoff, limit);

    if (evals.length === 0) {
      return NextResponse.json({
        count: 0,
        avg: { legal: 0, ethical: 0, professional: 0, ux: 0 },
      });
    }

    // 计算各维度平均分
    let legalSum = 0;
    let ethicalSum = 0;
    let professionalSum = 0;
    let uxSum = 0;

    for (const e of evals) {
      legalSum += e.legalScore;
      ethicalSum += e.ethicalScore;
      professionalSum += e.professionalScore;
      uxSum += e.uxScore;
    }

    const n = evals.length;
    return NextResponse.json({
      count: n,
      avg: {
        legal: Math.round((legalSum / n) * 10) / 10,
        ethical: Math.round((ethicalSum / n) * 10) / 10,
        professional: Math.round((professionalSum / n) * 10) / 10,
        ux: Math.round((uxSum / n) * 10) / 10,
      },
    });
  } catch (e: any) {
    console.error('[DimensionStats] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
