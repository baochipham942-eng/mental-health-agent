import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../auth-guard';
import * as taskStore from '@/lib/eval/annotation-task-store';

/**
 * GET /api/eval/annotation-tasks — 查询标注任务列表
 * Query: ?status=PENDING&assignedTo=admin&priority=2&limit=20&offset=0
 */
export async function GET(req: NextRequest) {
  try {
    const denied = await requireEvalAuth();
    if (denied) return denied;

    const params = req.nextUrl.searchParams;
    const status = params.get('status') || undefined;
    const assignedTo = params.get('assignedTo') || undefined;
    const priority = params.has('priority') ? Number(params.get('priority')) : undefined;
    const limit = parseInt(params.get('limit') || '20');
    const offset = parseInt(params.get('offset') || '0');

    const tasks = taskStore.findTasks({ status, assignedTo, priority, limit, offset });
    const stats = taskStore.getTaskStats();

    return NextResponse.json({ tasks, stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/eval/annotation-tasks — 创建标注任务
 *
 * 两种模式：
 * 1. 单个创建: { evaluationId, conversationId, priority? }
 * 2. 批量生成: { action: 'generate', threshold?: 5 }
 */
export async function POST(req: NextRequest) {
  try {
    const denied = await requireEvalAuth();
    if (denied) return denied;

    const body = await req.json();

    // 批量生成模式
    if (body.action === 'generate') {
      const threshold = body.threshold ?? 5;
      const count = taskStore.createTasksFromLowScores(threshold);
      const stats = taskStore.getTaskStats();
      return NextResponse.json({ created: count, stats });
    }

    // 单个创建模式
    const { evaluationId, conversationId, priority } = body;
    if (!evaluationId || !conversationId) {
      return NextResponse.json(
        { error: 'evaluationId 和 conversationId 为必填项' },
        { status: 400 }
      );
    }

    const task = taskStore.createTask({ evaluationId, conversationId, priority });
    return NextResponse.json({ task });
  } catch (err: any) {
    // UNIQUE 约束冲突（重复的 evaluationId）
    if (err.message?.includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: '该评估已存在对应的标注任务' }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
