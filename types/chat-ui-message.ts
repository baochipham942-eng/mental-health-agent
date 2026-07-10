/**
 * v6 UIMessage 类型 — 强类型 data parts 协议
 *
 * 替代 v3 时代扁平的 StreamData 数组。前端通过 message.parts.find(p => p.type === 'data-xxx')
 * 提取对应字段；后端通过 writer.write({type: 'data-xxx', data: {...}}) 写入。
 */

import type { UIMessage, InferUIMessageChunk } from 'ai';
import type { SKILL_CARDS } from '@/lib/ai/skills';
import type { SceneContext } from '@/lib/ai/scene';
import type { WebSearchDecision } from '@/lib/ai/websearch';
import type { WebSearchProcess } from '@/types/chat';

/** SkillCard 类型从 SKILL_CARDS 常量推导，避免重复定义 */
export type SkillCard = (typeof SKILL_CARDS)[keyof typeof SKILL_CARDS];

export type AdaptiveModeType = 'guardian' | 'companion' | 'guide' | 'coach';
export type RouteTypeName = 'support' | 'crisis' | 'assessment';
export type AssessmentStageName = 'intake' | 'conclusion';

/**
 * Chat UI message 类型 — 主 /api/chat + mbti + mentor 共用。
 * 不同路由用到的 part type 子集不同，但 schema 统一在这里维护。
 */
export type ChatUIMessage = UIMessage<
  // per-message metadata（暂不使用）
  Record<string, never>,
  // typed data parts
  {
    'route': { routeType: RouteTypeName };
    'state': { state?: string; reasoning?: string };
    'emotion': { label: string; score: number };
    'safety': {
      label: string;
      score: number;
      reasoning: string;
      constraints: string[];
    };
    'persona': { mode: string; reasoning?: string };
    'memory': { check?: string; retrieved?: string };
    'scene': SceneContext;
    'websearch': WebSearchDecision;
    'websearch-process': WebSearchProcess;
    'dialogue': {
      turn: number;
      phase: string;
      machineState?: string;
      riskLevel: string;
    };
    'adaptive-mode': { mode: AdaptiveModeType };
    'assessment-stage': { stage: AssessmentStageName };
    'action-cards': { cards: SkillCard[] };
    'relevant-memories': {
      memories: Array<{
        id: string;
        content: string;
        topic: string;
        sourceConvId?: string;
      }>;
    };
    'guard-input-blocked': { reason: string };
    'guard-output-redacted': { issues: string[] };
    'trace': Record<string, any>;
  }
>;

/** ChatUIMessage 对应的 stream chunk 类型（含文本 chunks + data-* chunks） */
export type ChatUIChunk = InferUIMessageChunk<ChatUIMessage>;
