/**
 * 单个数据集版本 API — 详情 & 删除
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../../auth-guard';
import {
  findVersionById,
  findCasesByVersionId,
  deleteVersion,
} from '@/lib/eval/dataset-version-store';

export const dynamic = 'force-dynamic';

/** 获取版本详情及用例 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  try {
    const version = findVersionById(params.id);
    if (!version) {
      return NextResponse.json({ error: '版本不存在' }, { status: 404 });
    }

    const cases = findCasesByVersionId(params.id);
    return NextResponse.json({ version, cases });
  } catch (e: any) {
    console.error('[DatasetVersions] GET [id] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** 删除版本（级联删除用例） */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  try {
    const version = findVersionById(params.id);
    if (!version) {
      return NextResponse.json({ error: '版本不存在' }, { status: 404 });
    }

    deleteVersion(params.id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[DatasetVersions] DELETE Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
