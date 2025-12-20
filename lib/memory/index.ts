/**
 * 记忆系统入口
 * 导出所有公开API
 */

// 类型
export * from './types';

// 管理器
export { MemoryManager, memoryManager } from './manager';

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
