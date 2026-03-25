/**
 * 轨迹评测 API
 *
 * GET  — 查询轨迹评测结果（需登录）
 * POST — 触发单条对话的轨迹评测（需管理员）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConversationWithMessageMeta } from '@/lib/eval/data-bridge';
import { requireEvalAuth } from '../auth-guard';
import { auth } from '@/auth';
import { logInfo, logError } from '@/lib/observability/logger';
import {
  evaluateTrace,
  writeTraceEval,
  getTraceEvals,
  getTraceStats,
} from '@/lib/eval/trace';
import type { TraceEvalInput } from '@/lib/eval/trace';

export const dynamic = 'force-dynamic';

/** 获取 LLM Judge 配置 */
function getEvalConfig() {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1',
    model: process.env.EVAL_MODEL || 'deepseek-chat',
  };
}

// ---------------------------------------------------------------------------
// GET — 查询轨迹评测结果
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authSession = await auth();
  if (!authSession?.user) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const grade = searchParams.get('grade') || undefined;
  const conversationId = searchParams.get('conversationId') || undefined;

  try {
    const rows = getTraceEvals({ limit, grade, conversationId });
    const stats = getTraceStats();

    return NextResponse.json({
      data: rows.map((r) => ({
        id: r.id,
        conversationId: r.conversation_id,
        userMessage: r.user_message,
        aiReply: r.ai_reply,
        traceScore: r.trace_score,
        traceGrade: r.trace_grade,
        traceJson: r.trace_json,
        triageResult: r.triage_result,
        triageCritique: r.triage_critique,
        safetyResult: r.safety_result,
        safetyCritique: r.safety_critique,
        personaResult: r.persona_result,
        personaCritique: r.persona_critique,
        emotionResult: r.emotion_result,
        emotionCritique: r.emotion_critique,
        toolResult: r.tool_result,
        toolCritique: r.tool_critique,
        guardResult: r.guard_result,
        guardCritique: r.guard_critique,
        evaluatedAt: r.evaluated_at,
        convEvalId: r.conv_eval_id,
      })),
      stats,
    });
  } catch (e: any) {
    logError('trace-eval-query-error', { error: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — 触发单条对话的轨迹评测
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { conversationId } = body;

    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json({ error: 'conversationId 必填' }, { status: 400 });
    }

    // 从 data-bridge 查询对话消息 + meta
    const conversation = await getConversationWithMessageMeta(conversationId);

    if (!conversation) {
      return NextResponse.json({ error: '对话不存在' }, { status: 404 });
    }

    if (conversation.messages.length < 2) {
      return NextResponse.json({ error: '对话消息不足（至少需要 2 条）' }, { status: 400 });
    }

    // 提取最后一轮 user + assistant 消息
    const userMessages = conversation.messages.filter(m => m.role === 'user');
    const assistantMessages = conversation.messages.filter(m => m.role === 'assistant');
    const lastUserMsg = userMessages[userMessages.length - 1];
    const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];

    if (!lastUserMsg || !lastAssistantMsg) {
      return NextResponse.json({ error: '缺少用户或助手消息' }, { status: 400 });
    }

    // 从 assistant message 的 meta 中提取 agentTrace 等数据
    const meta = (lastAssistantMsg.meta as Record<string, any>) || {};
    const agentTrace = meta.agentTrace || [];
    const safetyData = meta.safety || { label: 'normal', score: 0 };
    const routeType = meta.routeType || meta.state?.route || 'support';
    const adaptiveMode = meta.adaptiveMode || 'companion';
    const toolCalls = meta.toolCalls || [];
    const metaGuardResult = meta.guardResult;

    // 从 agentTrace 中提取 emotion 数据
    const emotionStep = agentTrace.find((s: any) => s.agent === 'emotion');
    const emotionData = emotionStep?.output || { label: 'neutral', score: 5 };

    // 构建历史消息（不包含最后一轮）
    const history = conversation.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(0, -2)
      .map(m => ({ role: m.role, content: m.content }));

    const evalInput: TraceEvalInput = {
      conversationId,
      userMessage: lastUserMsg.content,
      history,
      aiReply: lastAssistantMsg.content,
      traceSteps: agentTrace,
      routeType,
      safetyData,
      emotionData,
      adaptiveMode,
      toolCalls,
      guardResult: metaGuardResult,
    };

    logInfo('trace-eval-start', { conversationId });

    const result = await evaluateTrace(evalInput, getEvalConfig());

    writeTraceEval(result, {
      traceJson: JSON.stringify(agentTrace),
      userMessage: lastUserMsg.content,
      aiReply: lastAssistantMsg.content,
      historyJson: JSON.stringify(history),
      evalSource: 'manual',
    });

    logInfo('trace-eval-complete', {
      conversationId,
      traceScore: result.traceScore,
      traceGrade: result.traceGrade,
    });

    return NextResponse.json({ success: true, result });
  } catch (e: any) {
    logError('trace-eval-error', { error: e.message, stack: e.stack });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
