import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../../auth-guard';
import * as taskStore from '@/lib/eval/annotation-task-store';

/**
 * GET /api/eval/annotation-tasks/next — 获取下一个待标注任务
 * Query: ?assignedTo=admin
 *
 * 按优先级 DESC、创建时间 ASC 排序。
 * 如果指定了 assignedTo，优先返回分配给该人的 IN_PROGRESS 任务。
 */
export async function GET(req: NextRequest) {
  try {
    const denied = await requireEvalAuth();
    if (denied) return denied;

    const assignedTo = req.nextUrl.searchParams.get('assignedTo') || undefined;
    const task = taskStore.getNextTask(assignedTo);

    if (!task) {
      return NextResponse.json({ task: null, message: '没有待标注的任务' });
    }

    return NextResponse.json({ task });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
