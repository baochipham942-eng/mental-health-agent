/**
 * 统一 Trace 提取器
 *
 * 从 PostgreSQL 中提取已有对话的标准化评测数据，
 * 供 eval runner 的 product 模式使用。
 */

import { getConversationWithMessageMeta, getLabSessionWithMessages } from './data-bridge';

export interface TraceMessage {
  role: 'user' | 'assistant';
  content: string;
  mentorId?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ConversationTrace {
  id: string;
  title: string | null;
  type: 'conversation' | 'lab';
  labType?: string;
  messages: TraceMessage[];
  emotionTrajectory: number[];
  toolCalls: Array<{ name: string; arguments?: unknown }>;
  routeTypes: string[];
  safetyLabels: string[];
  dialogueStates: string[];
}

/**
 * 从 Conversation + Message 表提取普通咨询会话的完整 trace
 */
export async function extractConversationTrace(conversationId: string): Promise<ConversationTrace | null> {
  const conversation = await getConversationWithMessageMeta(conversationId);

  if (!conversation) return null;

  const messages: TraceMessage[] = [];
  const emotionTrajectory: number[] = [];
  const toolCalls: Array<{ name: string; arguments?: any }> = [];
  const routeTypes: string[] = [];
  const safetyLabels: string[] = [];
  const dialogueStates: string[] = [];

  for (const msg of conversation.messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;

    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      meta: msg.meta as Record<string, unknown> | null,
      createdAt: msg.createdAt,
    });

    // 从 assistant message 的 meta 中提取评测数据
    if (msg.role === 'assistant' && msg.meta) {
      const meta = msg.meta as Record<string, unknown>;

      // toolCalls
      if (Array.isArray(meta.toolCalls)) {
        for (const tc of meta.toolCalls as Array<Record<string, unknown>>) {
          const fn = tc.function as Record<string, unknown> | undefined;
          toolCalls.push({
            name: (fn?.name as string) || (tc.name as string) || 'unknown',
            arguments: fn?.arguments ?? tc.arguments,
          });
        }
      }

      // routeType
      if (typeof meta.routeType === 'string') routeTypes.push(meta.routeType);

      // safety
      const safety = meta.safety as Record<string, unknown> | undefined;
      if (safety && typeof safety.label === 'string') safetyLabels.push(safety.label);

      // dialogueContext 中的 emotionTrajectory
      const dialogueContext = meta.dialogueContext as Record<string, unknown> | undefined;
      if (dialogueContext && Array.isArray(dialogueContext.emotionTrajectory)) {
        for (const score of dialogueContext.emotionTrajectory) {
          if (typeof score === 'number' && !emotionTrajectory.includes(score)) {
            emotionTrajectory.push(score);
          }
        }
      }

      // dialogueContext 中的 state
      if (dialogueContext && typeof dialogueContext.state === 'string') {
        dialogueStates.push(dialogueContext.state);
      }
    }
  }

  return {
    id: conversation.id,
    title: conversation.title,
    type: 'conversation',
    messages,
    emotionTrajectory,
    toolCalls,
    routeTypes,
    safetyLabels,
    dialogueStates,
  };
}

/**
 * 从 LabSession + LabMessage 表提取实验室会话的完整 trace
 */
export async function extractLabSessionTrace(labSessionId: string): Promise<ConversationTrace | null> {
  const labSession = await getLabSessionWithMessages(labSessionId);

  if (!labSession) return null;

  const messages: TraceMessage[] = [];

  for (const msg of labSession.messages) {
    // 跳过 moderator 和 synthesis（评测只关注 user/assistant 交互）
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;

    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      mentorId: msg.mentorId,
      meta: msg.meta as Record<string, unknown> | null,
      createdAt: msg.createdAt,
    });
  }

  return {
    id: labSession.id,
    title: labSession.title,
    type: 'lab',
    labType: labSession.labType,
    messages,
    emotionTrajectory: [], // Lab 暂无情绪追踪
    toolCalls: [],
    routeTypes: [],
    safetyLabels: [],
    dialogueStates: [],
  };
}

/**
 * 批量提取多个会话的 trace（用于 product 模式评测）
 */
export async function extractTraces(
  conversationIds: string[],
  labSessionIds: string[] = [],
): Promise<ConversationTrace[]> {
  const traces: ConversationTrace[] = [];

  const results = await Promise.allSettled([
    ...conversationIds.map(id => extractConversationTrace(id)),
    ...labSessionIds.map(id => extractLabSessionTrace(id)),
  ]);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      traces.push(result.value);
    }
  }

  return traces;
}
