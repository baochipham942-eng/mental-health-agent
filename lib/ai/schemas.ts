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
    confidence: z.number().min(0).max(1)
});

export const ActionCardSchema = z.object({
    title: z.string().max(20),
    steps: z.array(z.string().max(50)),
    when: z.string().max(30),
    effort: z.enum(['low', 'medium', 'high']),
    widget: z.enum(['mood_tracker', 'breathing']).optional()
});

export const AssessmentConclusionSchema = z.object({
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
    attributes: z.record(z.string()).optional()
});

export const RelationshipSchema = z.object({
    source: z.string(),
    target: z.string(),
    type: z.enum(['trigger', 'cause', 'correlate', 'prevent']),
    description: z.string().optional()
});

export const ExtractedMemorySchema = z.object({
    topic: z.enum(['emotional_pattern', 'coping_preference', 'personal_context', 'therapy_progress', 'trigger_warning']),
    content: z.string(),
    confidence: z.number().min(0).max(1),
    entities: z.array(EntitySchema).optional(),
    relationships: z.array(RelationshipSchema).optional()
});

export const MemoryExtractionSchema = z.object({
    memories: z.array(ExtractedMemorySchema)
});
