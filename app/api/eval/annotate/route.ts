import { NextRequest, NextResponse } from 'next/server';
import { updateAnnotation, getAnnotationStats } from '../db-reader';

/**
 * POST /api/eval/annotate — 保存人工标注
 * Body: { runId, caseId, humanStatus, humanTags?, humanNote?, firstFailTurn? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { runId, caseId, humanStatus, humanTags, humanNote, firstFailTurn } = body;

    if (!runId || !caseId || !humanStatus) {
      return NextResponse.json({ error: 'runId, caseId, humanStatus required' }, { status: 400 });
    }

    if (!['pass', 'fail', 'pending'].includes(humanStatus)) {
      return NextResponse.json({ error: 'humanStatus must be pass/fail/pending' }, { status: 400 });
    }

    updateAnnotation({ runId, caseId, humanStatus, humanTags, humanNote, firstFailTurn });

    const stats = getAnnotationStats(runId);
    return NextResponse.json({ ok: true, stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
