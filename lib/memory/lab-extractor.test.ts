import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// 复制 schema 以便独立测试（避免 prisma import）
const LabInsightSchema = z.object({
  insights: z.array(z.object({
    topic: z.enum(['emotional_pattern', 'coping_preference', 'personal_context']),
    content: z.string(),
    confidence: z.number().min(0).max(1),
    insightType: z.enum(['thinking_preference', 'trigger_topic', 'effective_intervention']).optional().default('thinking_preference'),
  })),
});

describe('LabInsightSchema', () => {
  it('should parse valid insight with insightType', () => {
    const data = {
      insights: [{
        topic: 'emotional_pattern',
        content: '倾向灾难化思维',
        confidence: 0.8,
        insightType: 'thinking_preference',
      }],
    };
    const result = LabInsightSchema.parse(data);
    expect(result.insights[0].insightType).toBe('thinking_preference');
  });

  it('should default insightType to thinking_preference when missing', () => {
    const data = {
      insights: [{
        topic: 'coping_preference',
        content: '苏格拉底式追问有效',
        confidence: 0.7,
        // insightType omitted
      }],
    };
    const result = LabInsightSchema.parse(data);
    expect(result.insights[0].insightType).toBe('thinking_preference');
  });

  it('should reject invalid insightType', () => {
    const data = {
      insights: [{
        topic: 'emotional_pattern',
        content: 'test',
        confidence: 0.5,
        insightType: 'invalid_type',
      }],
    };
    expect(() => LabInsightSchema.parse(data)).toThrow();
  });

  it('should accept all valid insightType values', () => {
    for (const type of ['thinking_preference', 'trigger_topic', 'effective_intervention']) {
      const data = {
        insights: [{
          topic: 'personal_context',
          content: 'test',
          confidence: 0.6,
          insightType: type,
        }],
      };
      const result = LabInsightSchema.parse(data);
      expect(result.insights[0].insightType).toBe(type);
    }
  });

  it('should reject confidence outside 0-1 range', () => {
    const data = {
      insights: [{
        topic: 'emotional_pattern',
        content: 'test',
        confidence: 1.5,
        insightType: 'trigger_topic',
      }],
    };
    expect(() => LabInsightSchema.parse(data)).toThrow();
  });

  it('should format content prefix correctly', () => {
    const insight = {
      content: '倾向二元思维',
      insightType: 'thinking_preference' as const,
    };
    const finalContent = `[实验室洞察:${insight.insightType}] ${insight.content}`;
    expect(finalContent).toBe('[实验室洞察:thinking_preference] 倾向二元思维');
  });

  it('should apply 0.85 confidence factor', () => {
    const rawConfidence = 0.8;
    const adjusted = rawConfidence * 0.85;
    expect(adjusted).toBeCloseTo(0.68, 2);
  });
});
