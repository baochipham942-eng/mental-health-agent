/**
 * CI Runs API
 * 查询 Prompt 版本自动触发的评测运行记录
 */

import { NextRequest, NextResponse } from 'next/server';
import { findRecentCIRuns, findCIRunsByVersionId } from '@/lib/eval/prompt-ci-store';
import { requireEvalAuth } from '../auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const versionId = searchParams.get('versionId');

  try {
    const runs = versionId
      ? findCIRunsByVersionId(versionId)
      : findRecentCIRuns(limit);

    return NextResponse.json({ runs });
  } catch (e: any) {
    console.error('[CI-Runs API] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
