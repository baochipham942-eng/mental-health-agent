/**
 * Eval 配置加载器
 *
 * 从 JSON 文件加载评测配置，提供类型安全的访问接口。
 * JSON 存数据，TypeScript 存类型和逻辑。
 */

import graderConfig from './grader-dimensions.json';
import traceConfig from './trace-weights.json';
import guardConfig from './guard-rules.json';

// ============================================================
// Types
// ============================================================

export interface GraderDimension {
  id: string;
  name: string;
  type: 'code' | 'llm' | 'info';
  weight: number;
  description: string;
  judgeSummary: string;
}

export type WeightPreset = 'default' | 'mentor' | 'group';

// ============================================================
// Grader Dimensions
// ============================================================

export const GRADER_REGISTRY: GraderDimension[] = graderConfig.dimensions as GraderDimension[];

export const WEIGHT_PRESETS: Record<WeightPreset, Partial<Record<string, number>>> =
  graderConfig.weightPresets as Record<WeightPreset, Partial<Record<string, number>>>;

/** 维度 ID → 中文标签映射（Dashboard 用） */
export const DIM_LABELS: Record<string, string> = Object.fromEntries(
  GRADER_REGISTRY.map(d => [d.id, d.name])
);

// ============================================================
// Code Checks
// ============================================================

export const FORBIDDEN_WORDS: string[] = graderConfig.codeChecks.forbiddenWords;

/** 从 JSON 字符串数组编译为 RegExp 数组（仅首次加载时执行） */
export const GASLIGHTING_PATTERNS: RegExp[] =
  graderConfig.codeChecks.gaslightingPatterns.map(p => new RegExp(p));

// ============================================================
// Trace Weights
// ============================================================

export const TRACE_STEP_WEIGHTS: Record<string, number> = traceConfig.steps;

// ============================================================
// Guard Rules
// ============================================================

export const HARMFUL_KEYWORDS: string[] = guardConfig.harmfulKeywords;

export const PII_PATTERNS: RegExp[] =
  guardConfig.piiPatterns.map(p => new RegExp(p));
