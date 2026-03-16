/**
 * 记忆系统入口（V2）
 * 导出所有公开 API
 */

// 类型
export * from './types';
export * from './v2-types';

// V2 服务
export { ProfileMemoryService, profileMemoryService } from './profile-memory-service';
export { SessionSummaryV2Service, sessionSummaryV2Service } from './session-summary-v2-service';
export { MemoryContextService, memoryContextService } from './memory-context-service';
export { MemoryCandidateService, memoryCandidateService } from './memory-candidate-service';
export { ProfileMemoryMergeService, profileMemoryMergeService } from './profile-memory-merge-service';
export { SessionSummaryV2Writer, sessionSummaryV2Writer } from './session-summary-v2-writer';

// 缓存
export { MemoryCache, memoryCache } from './memory-cache';

// 提取器
export { extractMemoriesFromMessages } from './extractor';

// Session Metadata
export { updateSessionMetadata, getSessionMetadata, formatSessionMetadata } from './session-metadata';
export type { SessionMetadata } from './session-metadata';

// PII 工具
export { redactPII, containsPII } from './redact';
