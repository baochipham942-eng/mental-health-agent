import type { UIMessageStreamWriter } from 'ai';
import type { AdaptiveModeType, ChatUIMessage, RouteTypeName } from '@/types/chat-ui-message';
import type { SceneContext } from '@/lib/ai/scene';
import type { WebSearchDecision } from '@/lib/ai/websearch';

/**
 * 响应可见性收口：safety 评估 / 路由 reasoning / agentTrace / 记忆操作等
 * 系统内部分析只发给管理员，普通用户的响应保持干净（轻松陪伴、去医疗化定位）。
 * Langfuse / DB 侧记录不经过这里，完全不受影响。
 */

/** 写入 pre-stream 元数据 parts；内部调试 parts 仅管理员可见 */
export function writeChatPreludeMetadata(
  writer: UIMessageStreamWriter<ChatUIMessage>,
  params: {
    isAdmin: boolean;
    routeType: RouteTypeName;
    sceneContext: SceneContext;
    webSearchDecision: WebSearchDecision;
    adaptiveMode: AdaptiveModeType;
    stateData: { reasoning: string };
    safetyData: { label: string; score: number; reasoning: string; constraints: string[] };
    personaData: { mode: string; reasoning?: string };
    memoryData: { check?: string; retrieved?: string };
    dialogueData: { turn: number; phase: string; machineState?: string; riskLevel: string };
    traceData: Record<string, any>;
  },
): void {
  // 产品功能 parts：路由（危机横幅/结论渲染）、场景与实时检索（理解层卡片）、人格模式
  writer.write({ type: 'data-route', data: { routeType: params.routeType } });
  writer.write({ type: 'data-scene', data: params.sceneContext });
  writer.write({ type: 'data-websearch', data: params.webSearchDecision });
  writer.write({ type: 'data-adaptive-mode', data: { mode: params.adaptiveMode } });

  if (!params.isAdmin) return;

  // 内部调试 parts：仅管理员（前端 CoT 面板据此渲染）
  // state 字段只承载合法枚举（crisis/support handler 会覆写）；
  // reasoning 文本别塞进 state——前端会把它平铺成 responseData.state 回填请求，撞服务端 z.enum 报 400
  writer.write({ type: 'data-state', data: { reasoning: params.stateData.reasoning } });
  writer.write({ type: 'data-safety', data: params.safetyData });
  writer.write({ type: 'data-persona', data: params.personaData });
  writer.write({ type: 'data-memory', data: params.memoryData });
  writer.write({ type: 'data-dialogue', data: params.dialogueData });
  writer.write({ type: 'data-trace', data: params.traceData });
}

/** 持久化 meta 中的内部分析字段（历史会话页回灌给普通用户前剥掉） */
const INTERNAL_META_KEYS = ['safety', 'state', 'agentTrace', 'dialogueContext', 'persona', 'memory'];

export function sanitizeMessageMetaForUser(meta: unknown): Record<string, any> | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  const clean: Record<string, any> = { ...(meta as Record<string, any>) };
  for (const key of INTERNAL_META_KEYS) delete clean[key];
  return clean;
}
