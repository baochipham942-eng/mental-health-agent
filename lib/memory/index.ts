/**
 * 记忆系统入口
 * 导出所有公开API
 */

// 类型
export * from './types';
export * from './v2-types';

// 管理器
export { MemoryManager, memoryManager } from './manager';
export { ProfileMemoryService, profileMemoryService } from './profile-memory-service';
export { SessionSummaryV2Service, sessionSummaryV2Service } from './session-summary-v2-service';
export { MemoryContextService, memoryContextService } from './memory-context-service';
export { MemoryCandidateService, memoryCandidateService } from './memory-candidate-service';
export { ProfileMemoryMergeService, profileMemoryMergeService } from './profile-memory-merge-service';
export { SessionSummaryV2Writer, sessionSummaryV2Writer } from './session-summary-v2-writer';

// 检索器
export {
    retrieveMemories,
    retrieveRelevantMemories,
    getMemoriesByTopic,
    getRecentMemories,
    memoryToolDefinition,
    executeMemoryTool,
} from './retriever';

// 提取器（一般不直接使用，通过manager调用）
export { extractMemoriesFromMessages } from './extractor';

// Prompt格式化
export { formatMemoriesForInjection } from './prompts';

// PII工具
export { redactPII, containsPII } from './redact';

// 艾宾浩斯遗忘曲线
export {
    calculateMemoryStrength,
    updateAfterAccess,
    shouldForget,
    rankByStrength,
    getMemoriesToPrune,
    FORGETTING_TOPICS,
    SLOW_DECAY_TOPICS,
    PERMANENT_TOPICS,
} from './forgetting-curve';
