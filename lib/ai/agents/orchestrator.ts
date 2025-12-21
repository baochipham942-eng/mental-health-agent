import { ChatMessage } from '../deepseek';
import { runSafetyObserver, SafetyAssessment } from './safety-observer';

export interface OrchestrationResult {
    safety: SafetyAssessment;
    // Future agents (e.g., MemoryExtractor, SkillRecommender) can be added here
}

/**
 * Orchestrator: 协调多 Agent 的执行
 */
export async function coordinateAgents(
    userMessage: string,
    history: ChatMessage[],
    options?: { traceMetadata?: Record<string, any> }
): Promise<OrchestrationResult> {
    console.log('[Orchestrator] Starting parallel coordination...');

    // 目前主要协调 SafetyObserver
    // 未来可以并行执行语义搜索、记忆提取等
    const [safetyResult] = await Promise.all([
        runSafetyObserver(userMessage, history, { traceMetadata: options?.traceMetadata }),
    ]);

    console.log('[Orchestrator] Coordination finished. Results:', {
        safety: safetyResult.label,
        score: safetyResult.score
    });

    return {
        safety: safetyResult,
    };
}
