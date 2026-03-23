/**
 * 轨迹评测类型定义
 *
 * 定义 trace 级别评测的所有输入/输出数据结构。
 * 与对话级评测（judges.ts）互补，聚焦于 pipeline 各步骤的正确性。
 */

/** 单个 pipeline 步骤的执行数据 */
export interface TraceStep {
  agent: string;
  startMs: number;
  durationMs: number;
  model?: string;
  skipped?: boolean;
  result?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  reasoning?: string;
}

/** 轨迹步骤名称枚举 */
export type TraceStepName = 'triage' | 'safety' | 'persona' | 'emotion' | 'tool' | 'guard';

/** 步骤评测三态判定 + Skip */
export type StepVerdict = 'Pass' | 'Wrong' | 'Drift' | 'Skip';

/** 单个步骤的评测结果 */
export interface StepEvalResult {
  step: TraceStepName;
  verdict: StepVerdict;
  critique: string;
  reasoning?: string;
}

/** evaluateTrace() 的输入数据 */
export interface TraceEvalInput {
  conversationId: string;
  userMessage: string;
  history?: Array<{ role: string; content: string }>;
  aiReply?: string;
  traceSteps: TraceStep[];
  /** triage agent 的路由结果 */
  routeType: string;
  /** safety agent 的检测结果 */
  safetyData: { label: string; score: number; reasoning?: string };
  /** emotion agent 的识别结果 */
  emotionData: { label: string; score: number };
  /** persona 模式选择 */
  adaptiveMode: string;
  /** 工具调用记录 */
  toolCalls?: any[];
  /** output guard 检查结果 */
  guardResult?: { safe: boolean; issues: string[] };
}

/** evaluateTrace() 的输出结果 */
export interface TraceEvalResult {
  conversationId: string;
  steps: StepEvalResult[];
  traceScore: number;       // 0-1
  traceGrade: string;       // A/B/C/D/F
  evaluatedBy: string;
  evaluatedAt: string;
}
