import { describe, it, expect } from 'vitest';
import { formatMemoriesForInjection } from './prompts';

describe('formatMemoriesForInjection', () => {
  it('should return empty string for empty memories', () => {
    expect(formatMemoriesForInjection([])).toBe('');
  });

  it('should group regular memories by topic', () => {
    const memories = [
      { topic: 'emotional_pattern', content: '面临不确定性时易焦虑' },
      { topic: 'personal_context', content: '在科技公司工作' },
    ];
    const result = formatMemoriesForInjection(memories);
    expect(result).toContain('用户背景记忆');
    expect(result).toContain('面临不确定性时易焦虑');
    expect(result).toContain('在科技公司工作');
  });

  it('should separate lab insights into "探索发现" section', () => {
    const memories = [
      { topic: 'emotional_pattern', content: '容易焦虑' },
      { topic: 'emotional_pattern', content: '[实验室洞察:thinking_preference] 倾向二元思维' },
      { topic: 'coping_preference', content: '[实验室洞察:effective_intervention] 苏格拉底式追问有效' },
    ];
    const result = formatMemoriesForInjection(memories);

    // 普通记忆在常规分组
    expect(result).toContain('容易焦虑');
    // 实验室洞察在"探索发现"分组
    expect(result).toContain('探索发现');
    expect(result).toContain('[实验室洞察:thinking_preference] 倾向二元思维');
    expect(result).toContain('[实验室洞察:effective_intervention] 苏格拉底式追问有效');
  });

  it('should not show "探索发现" section when no lab insights', () => {
    const memories = [
      { topic: 'personal_context', content: '喜欢画画' },
    ];
    const result = formatMemoriesForInjection(memories);
    expect(result).not.toContain('探索发现');
  });

  it('should handle all memories being lab insights', () => {
    const memories = [
      { topic: 'emotional_pattern', content: '[实验室洞察:trigger_topic] 讨论原生家庭时情绪激动' },
    ];
    const result = formatMemoriesForInjection(memories);
    expect(result).toContain('探索发现');
    expect(result).toContain('[实验室洞察:trigger_topic]');
  });

  it('should include relationship patterns for regular memories', () => {
    const memories = [
      {
        topic: 'emotional_pattern',
        content: '工作压力导致失眠',
        relationships: [{ source: '工作压力', target: '失眠', type: 'trigger' }],
      },
    ];
    const result = formatMemoriesForInjection(memories);
    expect(result).toContain('模式: 工作压力 -> [trigger] -> 失眠');
  });
});
