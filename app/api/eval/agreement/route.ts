/**
 * 人机评分一致性分析 API
 *
 * GET /api/eval/agreement
 * 返回 AgreementAnalysis（Cohen's Kappa、Pearson、RMSE、分维度统计）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../auth-guard';
import { analyzeAgreement } from '@/lib/eval/agreement-stats';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  try {
    const analysis = analyzeAgreement();
    return NextResponse.json(analysis);
  } catch (e: any) {
    console.error('[AgreementAPI] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
