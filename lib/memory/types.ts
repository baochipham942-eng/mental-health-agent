/**
 * 记忆系统类型定义
 * 基于Google Agent记忆能力白皮书设计
 */

/**
 * 记忆主题类型
 * - emotional_pattern: 情绪模式（触发因素、常见情绪反应）
 * - coping_preference: 应对偏好（用户认可的放松/应对策略）
 * - personal_context: 个人背景（重要的家庭、工作等信息）
 * - therapy_progress: 疗愈进展（改善或退步迹象）
 * - trigger_warning: 触发预警（敏感话题或需要避免的内容）
 */
export type MemoryTopic =
    | 'emotional_pattern'
    | 'coping_preference'
    | 'personal_context'
    | 'therapy_progress'
    | 'trigger_warning'
    | 'communication_style';

export const MEMORY_TOPIC_LABELS: Record<MemoryTopic, string> = {
    emotional_pattern: '情绪模式',
    coping_preference: '偏好策略',
    personal_context: '个人背景',
    therapy_progress: '疗愈进展',
    trigger_warning: '敏感话题',
    communication_style: '沟通偏好',
};

export const ALL_MEMORY_TOPICS: MemoryTopic[] = [
    'emotional_pattern',
    'coping_preference',
    'personal_context',
    'therapy_progress',
    'trigger_warning',
    'communication_style',
];

/**
 * 记忆对象接口
 */
export interface Memory {
    id: string;
    userId: string;
    topic: MemoryTopic;
    content: string;
    entities?: any;
    relationships?: any;
    confidence: number;
    sourceConvId?: string | null;
    createdAt: Date;
    updatedAt: Date;
    accessedAt: Date;
    // Ebbinghaus forgetting curve fields
    accessCount: number;
    stabilityFactor: number;
    memoryStrength: number;
}

/**
 * 实体模型
 */
export interface Entity {
    name: string;
    type: 'person' | 'event' | 'object' | 'emotion' | 'belief';
    attributes?: Record<string, string>;
}

/**
 * 语义关系模型 (Semantic Relationship)
 * 表示 实体 A -> 关系 -> 实体 B
 * 例如: "加班" (event) -> "导致" (trigger) -> "焦虑" (emotion)
 */
export interface Relationship {
    source: string;
    target: string;
    type: 'trigger' | 'cause' | 'correlate' | 'prevent';
    description?: string;
}

/**
 * 记忆提取结果（从对话中提取的单条记忆）
 */
export interface ExtractedMemory {
    topic: MemoryTopic;
    content: string;
    confidence: number;
    entities?: Entity[];
    relationships?: Relationship[];
}

/**
 * 记忆整合操作类型
 */
export type MemoryAction = 'create' | 'update' | 'delete' | 'skip';

/**
 * 记忆整合结果
 */
export interface ConsolidationResult {
    action: MemoryAction;
    targetMemoryId?: string; // update/delete时指定目标
    mergedContent?: string;  // update时的合并内容
    reason: string;          // 决策理由
}

/**
 * 记忆检索选项
 */
export interface MemoryRetrievalOptions {
    topics?: MemoryTopic[];
    limit?: number;
    minConfidence?: number;
}

/**
 * 对话消息格式（用于记忆提取）
 */
export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

/**
 * 记忆提取日志状态
 */
export type ExtractionStatus = 'success' | 'failed' | 'skipped';
