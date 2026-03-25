/**
 * 维度级人工标注 API
 *
 * GET  ?evaluationId=xxx        → 返回该评估的所有标注
 * GET  ?stats=true              → 返回全局标注统计
 * POST { evaluationId, dimension, agree, humanScore?, note? } → 创建/更新标注
 */

import { NextRequest, NextResponse } from 'next/server';
import { upsertEvalAnnotation, getEvalAnnotations, getEvalAnnotationStats } from '@/lib/eval/data-bridge';
import { requireEvalAuth } from '../auth-guard';

export const dynamic = 'force-dynamic';

const VALID_DIMENSIONS = ['legal', 'ethical', 'professional', 'ux', 'overall'];

export async function GET(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);

  // 统计模式
  if (searchParams.get('stats') === 'true') {
    try {
      const stats = getEvalAnnotationStats();
      return NextResponse.json(stats);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // 查询指定评估的标注
  const evaluationId = searchParams.get('evaluationId');
  if (!evaluationId) {
    return NextResponse.json({ error: '缺少 evaluationId 参数' }, { status: 400 });
  }

  try {
    const annotations = getEvalAnnotations(evaluationId);
    return NextResponse.json({ annotations });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { evaluationId, dimension, agree, humanScore, note } = body;

    if (!evaluationId || !dimension) {
      return NextResponse.json({ error: '缺少 evaluationId 或 dimension' }, { status: 400 });
    }

    if (!VALID_DIMENSIONS.includes(dimension)) {
      return NextResponse.json({ error: `dimension 必须为: ${VALID_DIMENSIONS.join(', ')}` }, { status: 400 });
    }

    if (typeof agree !== 'boolean') {
      return NextResponse.json({ error: 'agree 必须为布尔值' }, { status: 400 });
    }

    if (humanScore !== undefined && humanScore !== null) {
      if (typeof humanScore !== 'number' || humanScore < 0 || humanScore > 10) {
        return NextResponse.json({ error: 'humanScore 必须为 0-10 的整数' }, { status: 400 });
      }
    }

    upsertEvalAnnotation({
      evaluationId,
      dimension,
      agree,
      humanScore: humanScore ?? undefined,
      note: note ?? undefined,
      annotatedBy: 'admin',
    });

    // 返回该评估的最新标注列表
    const annotations = getEvalAnnotations(evaluationId);
    return NextResponse.json({ success: true, annotations });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
