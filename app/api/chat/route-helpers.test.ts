import { describe, expect, it } from 'vitest';
import {
  buildFallbackQuickAnalysis,
  buildLayeredMemoryContext,
  decideRouteByRules,
  detectExplicitAssessmentRequest,
} from './route-helpers';

describe('decideRouteByRules', () => {
  it('routes crisis messages when crisisCheckResult is true', () => {
    const result = decideRouteByRules({
      message: '我不想活了，太痛苦了',
      state: 'normal',
      crisisCheckResult: true,
    });

    expect(result.routeType).toBe('crisis');
    expect(result.reason).toBe('crisis_few_shot');
  });

  it('routes in_crisis state without needing crisis check', () => {
    const result = decideRouteByRules({
      message: '随便什么消息',
      state: 'in_crisis',
      crisisCheckResult: false,
    });

    expect(result.routeType).toBe('crisis');
    expect(result.reason).toBe('crisis_state');
  });

  it('keeps regular messages on support so the main model decides', () => {
    const result = decideRouteByRules({
      message: '我只想倾诉，不需要分析',
      state: 'normal',
      crisisCheckResult: false,
    });

    expect(result.routeType).toBe('support');
    expect(result.reason).toBe('main_model_default');
  });

  it('only enters assessment for locked followup flows', () => {
    const result = decideRouteByRules({
      message: '继续吧',
      state: 'awaiting_followup',
      crisisCheckResult: false,
    });

    expect(result.routeType).toBe('assessment');
    expect(result.reason).toBe('assessment_followup');
  });

  it('enters assessment when the user explicitly asks for an evaluation', () => {
    const result = decideRouteByRules({
      message: '我想做个心理评估',
      state: 'normal',
      explicitAssessmentRequest: true,
      crisisCheckResult: false,
    });

    expect(result.routeType).toBe('assessment');
    expect(result.reason).toBe('explicit_assessment_request');
  });
});

describe('buildLayeredMemoryContext', () => {
  it('keeps stable memory, adds preferences, and appends nickname guidance', () => {
    const result = buildLayeredMemoryContext({
      baseMemoryContext: '## 用户稳定信息\n- 喜欢被温和回应',
      userPreferences: ['希望少给建议，多一点陪伴', '希望少给建议，多一点陪伴', '晚上不想做太复杂的练习'],
      userNickname: '小林',
    });

    expect(result).toContain('## 用户稳定信息');
    expect(result).toContain('## 当前偏好提醒');
    expect(result).toContain('希望少给建议，多一点陪伴');
    expect(result).toContain('晚上不想做太复杂的练习');
    expect(result).toContain('用户昵称为「小林」');
  });
});

describe('buildFallbackQuickAnalysis', () => {
  it('derives a crisis fallback analysis from crisis check result', () => {
    const result = buildFallbackQuickAnalysis({
      crisisCheckResult: true,
    });

    expect(result.safety).toBe('crisis');
    expect(result.route).toBe('crisis');
    expect(result.emotion.score).toBeGreaterThanOrEqual(8);
  });

  it('returns normal fallback when no crisis detected', () => {
    const result = buildFallbackQuickAnalysis({
      crisisCheckResult: false,
    });

    expect(result.safety).toBe('normal');
    expect(result.route).toBe('support');
  });
});

describe('detectExplicitAssessmentRequest', () => {
  it('detects explicit assessment phrasing', () => {
    expect(detectExplicitAssessmentRequest('我想做个心理评估')).toBe(true);
    expect(detectExplicitAssessmentRequest('测试一下我最近状态')).toBe(true);
  });

  it('does not trigger on regular support messages', () => {
    expect(detectExplicitAssessmentRequest('最近有点累，想和你聊聊')).toBe(false);
  });
});
