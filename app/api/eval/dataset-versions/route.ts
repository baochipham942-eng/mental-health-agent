/**
 * 数据集版本 API — 列表 & 创建
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../auth-guard';
import {
  findAllVersions,
  createVersion,
  addCasesToVersion,
} from '@/lib/eval/dataset-version-store';

export const dynamic = 'force-dynamic';

/** 查询所有版本 */
export async function GET(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  try {
    const versions = findAllVersions();
    return NextResponse.json({ versions });
  } catch (e: any) {
    console.error('[DatasetVersions] GET Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** 创建新版本（可选同时添加用例） */
export async function POST(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { name, description, parentId, cases } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: '版本名称不能为空' }, { status: 400 });
    }

    const version = createVersion({ name, description, parentId });

    // 如果同时提供了用例，批量添加
    let caseCount = 0;
    if (Array.isArray(cases) && cases.length > 0) {
      caseCount = addCasesToVersion(version.id, cases);
    }

    return NextResponse.json({
      version: { ...version, caseCount },
    }, { status: 201 });
  } catch (e: any) {
    console.error('[DatasetVersions] POST Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
