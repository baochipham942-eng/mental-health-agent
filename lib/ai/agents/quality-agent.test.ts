import { describe, expect, it } from 'vitest';
import { normalizeQualityOutput } from './quality-agent';

describe('normalizeQualityOutput', () => {
  it('filters placeholder issues and suggestions', () => {
    const result = normalizeQualityOutput({
      score: 7.6,
      issues: ['问题2', '回复偏长，第二段信息太满', '问题5'],
      suggestions: ['建议1', '删掉一层重复安慰，只保留一个追问'],
    });

    expect(result).toEqual({
      score: 8,
      issues: ['回复偏长，第二段信息太满'],
      suggestions: ['删掉一层重复安慰，只保留一个追问'],
    });
  });

  it('dedupes and trims noisy lines', () => {
    const result = normalizeQualityOutput({
      score: 12,
      issues: ['  1. 回复有点像模板安慰  ', '回复有点像模板安慰', '问题1'],
      suggestions: ['"把第一句改得更具体一些"', '建议2'],
    });

    expect(result).toEqual({
      score: 10,
      issues: ['回复有点像模板安慰'],
      suggestions: ['把第一句改得更具体一些'],
    });
  });
});
