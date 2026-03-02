/**
 * Orchestrator — 协调多 Agent 的执行
 *
 * 执行流程：
 *   并行预处理: max(Triage ~300ms, Memory ~100ms)
 *   ↓
 *   条件触发: Safety (仅 urgent/crisis) ~500ms
 *   ↓
 *   Counselor: 流式生成回复 ~1000ms TTFT
 *   ↓
 *   异步: Quality 质检 (不阻塞)
 */

import { type AgentResult, runAgentConditional } from './base-agent';
import { getTriageAgent, runTriageWithFallback, type TriageInput } from './triage-agent';
import { getSafetyAgent, DEFAULT_SAFE, type SafetyAssessment, type SafetyInput } from './safety-agent';
import { runQualityCheckAsync, type QualityInput } from './quality-agent';
import type { QuickAnalysis } from '../groq';
import type { ChatMessage } from '../deepseek';

export interface OrchestrationInput {
    message: string;
    history: ChatMessage[];
    recentHistory: { role: string; content: string }[];
}

export interface OrchestrationResult {
    triage: AgentResult<QuickAnalysis>;
    safety: AgentResult<SafetyAssessment>;
}

/**
 * Phase 1: 并行预处理 (Triage + Memory 外部并行)
 * Phase 2: 条件触发 Safety
 */
export async function orchestrate(input: OrchestrationInput): Promise<OrchestrationResult> {
    // Phase 1: Triage（带 Groq→DeepSeek→关键词 三级降级）
    const triageResult = await runTriageWithFallback({
        message: input.message,
        recentHistory: input.recentHistory,
    });

    console.log('[Orchestrator] Triage:', {
        safety: triageResult.data.safety,
        route: triageResult.data.route,
        latency: triageResult.latency,
        success: triageResult.success,
    });

    // Phase 2: Safety（条件触发，仅在非 normal 时执行）
    const needsSafetyCheck = triageResult.data.safety !== 'normal';
    const safetyResult = await runAgentConditional(
        getSafetyAgent(),
        {
            message: input.message,
            history: input.history,
            triageSafety: triageResult.data.safety,
        } as SafetyInput,
        needsSafetyCheck
    );

    if (needsSafetyCheck) {
        console.log('[Orchestrator] Safety:', {
            label: safetyResult.data.label,
            score: safetyResult.data.score,
            latency: safetyResult.latency,
        });
    }

    return { triage: triageResult, safety: safetyResult };
}

/**
 * Phase 4: 异步质检（在回复生成完成后调用）
 */
export function triggerQualityCheck(input: QualityInput): void {
    runQualityCheckAsync(input);
}

export { type QuickAnalysis } from '../groq';
export { type SafetyAssessment } from './safety-agent';
