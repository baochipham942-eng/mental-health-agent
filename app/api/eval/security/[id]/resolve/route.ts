/**
 * 安全事件解决 API
 *
 * POST /api/eval/security/[id]/resolve — 标记事件为已解决
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../../../auth-guard';
import { resolveEvent, findEventById } from '@/lib/eval/security-event-store';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  const { id } = await params;

  try {
    // 检查事件是否存在
    const existing = findEventById(id);
    if (!existing) {
      return NextResponse.json({ error: '事件不存在' }, { status: 404 });
    }

    if (existing.resolved) {
      return NextResponse.json({ error: '事件已被解决' }, { status: 400 });
    }

    const body = await request.json();
    const { resolvedBy } = body;

    if (!resolvedBy) {
      return NextResponse.json({ error: '缺少必填字段：resolvedBy' }, { status: 400 });
    }

    const resolved = resolveEvent(id, resolvedBy);
    if (!resolved) {
      return NextResponse.json({ error: '解决事件失败' }, { status: 500 });
    }

    return NextResponse.json({
      id: resolved.id,
      conversationId: resolved.conversationId,
      eventType: resolved.eventType,
      severity: resolved.severity,
      description: resolved.description,
      metadata: resolved.metadata,
      resolved: resolved.resolved,
      resolvedBy: resolved.resolvedBy,
      resolvedAt: resolved.resolvedAt?.toISOString() ?? null,
      createdAt: resolved.createdAt.toISOString(),
    });
  } catch (e: any) {
    console.error('[SecurityResolve] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
