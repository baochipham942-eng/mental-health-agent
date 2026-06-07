import { z } from 'zod';

export const EmotionLabelSchema = z.enum([
    '焦虑',
    '抑郁',
    '愤怒',
    '悲伤',
    '恐惧',
    '快乐',
    '平静'
]);

export const EmotionAnalysisSchema = z.object({
    label: EmotionLabelSchema,
    score: z.number().min(0).max(10),
    confidence: z.number().min(0).max(1).optional()
});

export const ActionCardSchema = z.object({
    title: z.string().max(20),
    steps: z.array(z.string().max(50)),
    when: z.string().max(30).optional(), // 可选，支持 fallback
    effort: z.enum(['low', 'medium', 'high']).optional(), // 可选，支持 fallback
    widget: z.enum(['mood_tracker', 'breathing']).optional()
});

export const AssessmentConclusionSchema = z.object({
    reasoning: z.string().optional(), // CoT 推理过程（可选，不影响解析）
    summary: z.string(),
    riskAndTriage: z.string(),
    nextStepList: z.array(z.string()),
    actionCards: z.array(ActionCardSchema)
});

export const SafetyAssessmentSchema = z.object({
    reasoning: z.string(),
    label: z.enum(['crisis', 'urgent', 'self-care', 'normal']),
    score: z.number().min(0).max(10)
});

export const CrisisClassificationSchema = z.object({
    crisis: z.boolean(),
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.string().optional()
});

export const EntitySchema = z.object({
    name: z.string(),
    type: z.enum(['person', 'event', 'object', 'emotion', 'belief']),
    attributes: z.record(z.string(), z.string()).optional()
});

export const RelationshipSchema = z.object({
    source: z.string(),
    target: z.string(),
    type: z.enum(['trigger', 'cause', 'correlate', 'prevent']),
    description: z.string().optional()
});

export const ExtractedMemorySchema = z.object({
    // 模型偶尔会返回枚举外的 topic（如把"喜欢钓鱼"标成 hobby/interest），
    // 不兜底的话一条不合规就会让整批 memories 的 Zod 校验失败、记忆全部丢弃（#16 次因）。
    // 用 .catch 让未知 topic 回落到 personal_context，保住记忆内容本身，只默认其分类。
    topic: z.enum(['emotional_pattern', 'coping_preference', 'personal_context', 'therapy_progress', 'trigger_warning', 'communication_style']).catch('personal_context'),
    content: z.string(),
    confidence: z.number().min(0).max(1),
    entities: z.array(EntitySchema).optional(),
    relationships: z.array(RelationshipSchema).optional()
});

export const MemoryExtractionSchema = z.object({
    memories: z.array(ExtractedMemorySchema)
});
