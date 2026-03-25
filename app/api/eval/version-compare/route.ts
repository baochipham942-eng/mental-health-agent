/**
 * 线上评估版本对比 API
 *
 * GET /api/eval/version-compare?v1=<versionId>&v2=<versionId>
 * 对比两个 Prompt 版本关联的 ConversationEvaluation 结果
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../auth-guard';
import { findEvalsByVersionId } from '@/lib/eval/data-bridge';
import type { EvalRow } from '@/lib/eval/eval-store';

export const dynamic = 'force-dynamic';

// ---------- Types ----------

interface VersionStats {
  versionId: string;
  evalCount: number;
  avgScore: number;
  gradeDistribution: Record<string, number>;
  dimensions: {
    legal: number;
    ethical: number;
    professional: number;
    ux: number;
  };
}

interface CaseComparison {
  conversationId: string;
  v1Score: number;
  v2Score: number;
  v1Grade: string;
  v2Grade: string;
  diff: number;
  status: 'improved' | 'regressed' | 'unchanged';
}

// ---------- Helpers ----------

function computeStats(versionId: string, evals: EvalRow[]): VersionStats {
  if (evals.length === 0) {
    return {
      versionId,
      evalCount: 0,
      avgScore: 0,
      gradeDistribution: {},
      dimensions: { legal: 0, ethical: 0, professional: 0, ux: 0 },
    };
  }

  const totalScore = evals.reduce((s, e) => s + e.overallScore, 0);
  const avgScore = Math.round((totalScore / evals.length) * 10) / 10;

  const gradeDistribution: Record<string, number> = {};
  for (const e of evals) {
    gradeDistribution[e.overallGrade] = (gradeDistribution[e.overallGrade] || 0) + 1;
  }

  const dimensions = {
    legal: Math.round((evals.reduce((s, e) => s + e.legalScore, 0) / evals.length) * 10) / 10,
    ethical: Math.round((evals.reduce((s, e) => s + e.ethicalScore, 0) / evals.length) * 10) / 10,
    professional: Math.round((evals.reduce((s, e) => s + e.professionalScore, 0) / evals.length) * 10) / 10,
    ux: Math.round((evals.reduce((s, e) => s + e.uxScore, 0) / evals.length) * 10) / 10,
  };

  return { versionId, evalCount: evals.length, avgScore, gradeDistribution, dimensions };
}

export async function GET(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const v1 = searchParams.get('v1');
  const v2 = searchParams.get('v2');

  if (!v1 || !v2) {
    return NextResponse.json({ error: '缺少参数 v1 或 v2' }, { status: 400 });
  }

  if (v1 === v2) {
    return NextResponse.json({ error: '请选择不同的版本' }, { status: 400 });
  }

  try {
    const evals1 = findEvalsByVersionId(v1);
    const evals2 = findEvalsByVersionId(v2);

    const stats1 = computeStats(v1, evals1);
    const stats2 = computeStats(v2, evals2);

    // 找共同 conversationId 做 case 级对比
    const map1 = new Map(evals1.map(e => [e.conversationId, e]));
    const map2 = new Map(evals2.map(e => [e.conversationId, e]));

    const commonIds = [...map1.keys()].filter(id => map2.has(id));
    const caseComparisons: CaseComparison[] = commonIds.map(cid => {
      const e1 = map1.get(cid)!;
      const e2 = map2.get(cid)!;
      const diff = Math.round((e2.overallScore - e1.overallScore) * 10) / 10;
      let status: CaseComparison['status'] = 'unchanged';
      if (diff > 0.5) status = 'improved';
      else if (diff < -0.5) status = 'regressed';
      return {
        conversationId: cid,
        v1Score: e1.overallScore,
        v2Score: e2.overallScore,
        v1Grade: e1.overallGrade,
        v2Grade: e2.overallGrade,
        diff,
        status,
      };
    }).sort((a, b) => a.diff - b.diff); // 退化排前面

    // 各维度最大差异
    const dimDiffs = {
      legal: Math.round((stats2.dimensions.legal - stats1.dimensions.legal) * 10) / 10,
      ethical: Math.round((stats2.dimensions.ethical - stats1.dimensions.ethical) * 10) / 10,
      professional: Math.round((stats2.dimensions.professional - stats1.dimensions.professional) * 10) / 10,
      ux: Math.round((stats2.dimensions.ux - stats1.dimensions.ux) * 10) / 10,
    };

    return NextResponse.json({
      stats1,
      stats2,
      dimDiffs,
      caseComparisons,
      commonCaseCount: commonIds.length,
    });
  } catch (e: any) {
    console.error('[VersionCompare] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
