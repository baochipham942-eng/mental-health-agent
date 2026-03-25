/**
 * 数据集版本对比 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../../auth-guard';
import { compareCases } from '@/lib/eval/dataset-version-store';

export const dynamic = 'force-dynamic';

/** 对比两个版本的用例差异 */
export async function GET(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const a = searchParams.get('a');
    const b = searchParams.get('b');

    if (!a || !b) {
      return NextResponse.json({ error: '需要提供 a 和 b 两个版本 ID' }, { status: 400 });
    }

    const result = compareCases(a, b);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[DatasetVersions] Compare Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
