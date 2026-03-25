import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../../auth-guard';
import * as taskStore from '@/lib/eval/annotation-task-store';

/**
 * GET /api/eval/annotation-tasks/[id] — 获取单个标注任务详情
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireEvalAuth();
    if (denied) return denied;

    const { id } = await params;
    const task = taskStore.findTaskById(id);
    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/eval/annotation-tasks/[id] — 更新标注任务
 * Body: { status?, assignedTo?, notes? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireEvalAuth();
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const { status, assignedTo, notes } = body;

    // 校验 status
    if (status && !['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'].includes(status)) {
      return NextResponse.json(
        { error: 'status 必须为 PENDING/IN_PROGRESS/COMPLETED/SKIPPED' },
        { status: 400 }
      );
    }

    // 完成和跳过使用专用方法
    let task;
    if (status === 'COMPLETED') {
      task = taskStore.completeTask(id);
    } else if (status === 'SKIPPED') {
      task = taskStore.skipTask(id);
    } else {
      task = taskStore.updateTask(id, { status, assignedTo, notes });
    }

    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
