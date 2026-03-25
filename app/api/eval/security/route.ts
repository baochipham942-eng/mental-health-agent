/**
 * 安全红线 API
 *
 * GET  — 返回安全看板数据（指标 + 事件列表 + 低分预警）
 * POST — 记录新的安全事件
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../auth-guard';
import * as secStore from '@/lib/eval/security-event-store';
import { calculateSafetyMetrics } from '@/lib/eval/security-metrics';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '7', 10);

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    // 并行获取数据
    const metrics = secStore.getMetrics(since);
    const events = secStore.findEvents({ limit: 100 });
    const lowScoreAlerts = secStore.getLowScoreAlerts(since);

    // 计算综合安全指标
    const allEvents = secStore.findEvents({ limit: 1000 });
    const recentEvents = allEvents.filter(e => e.createdAt >= since);

    // 从低分预警中提取评分用于综合安全分计算
    const evalScores = lowScoreAlerts.map(a => ({
      legal: a.dimension === 'legal' ? a.score : 10,
      ethical: a.dimension === 'ethical' ? a.score : 10,
    }));

    const safetyMetrics = calculateSafetyMetrics(recentEvents, evalScores);

    return NextResponse.json({
      metrics,
      safetyMetrics,
      events: events.map(serializeEvent),
      lowScoreAlerts: lowScoreAlerts.map(a => ({
        conversationId: a.conversationId,
        dimension: a.dimension,
        score: a.score,
        evaluatedAt: a.evaluatedAt.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error('[SecurityAPI] GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();

    // 参数验证
    const { conversationId, eventType, severity, description, metadata } = body;

    if (!eventType || !severity || !description) {
      return NextResponse.json(
        { error: '缺少必填字段：eventType, severity, description' },
        { status: 400 },
      );
    }

    const validTypes = ['CRISIS_DETECTED', 'GUARDRAIL_TRIGGERED', 'LOW_LEGAL_SCORE', 'LOW_ETHICAL_SCORE', 'CONTENT_VIOLATION'];
    if (!validTypes.includes(eventType)) {
      return NextResponse.json(
        { error: `无效的事件类型，可选值：${validTypes.join(', ')}` },
        { status: 400 },
      );
    }

    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!validSeverities.includes(severity)) {
      return NextResponse.json(
        { error: `无效的严重度，可选值：${validSeverities.join(', ')}` },
        { status: 400 },
      );
    }

    const event = secStore.recordEvent({
      conversationId: conversationId ?? null,
      eventType,
      severity,
      description,
      metadata: metadata ?? {},
    });

    return NextResponse.json(serializeEvent(event), { status: 201 });
  } catch (e: any) {
    console.error('[SecurityAPI] POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function serializeEvent(e: secStore.SecurityEvent) {
  return {
    id: e.id,
    conversationId: e.conversationId,
    eventType: e.eventType,
    severity: e.severity,
    description: e.description,
    metadata: e.metadata,
    resolved: e.resolved,
    resolvedBy: e.resolvedBy,
    resolvedAt: e.resolvedAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}
