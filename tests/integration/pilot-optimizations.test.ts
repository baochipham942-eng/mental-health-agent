/**
 * Pilot 前优化功能测试
 *
 * 覆盖 P0-P2 所有改动的核心逻辑（非 LLM 调用部分）
 */

import { describe, it, expect } from 'vitest';
import { generateSFBTQuery } from '@/lib/ai/sfbt';
import { PERSONA_INVARIANTS } from '@/lib/ai/prompts';
import { detectExplicitAssessmentRequest } from '@/app/api/chat/route-helpers';
import { trackFunnel, type FunnelEvent } from '@/lib/observability/funnel';

// =============================================================================
// P0-1A: SFBT 练习总结指令
// =============================================================================

describe('P0-1A: SFBT 练习后总结', () => {
  it('高分(4-5)回复应包含"本次小结"指令', () => {
    const query = generateSFBTQuery({ postScore: 5, exerciseName: '4-7-8呼吸法' });
    expect(query).toContain('本次小结');
    expect(query).toContain('4-7-8呼吸法');
    expect(query).toContain('5/5');
  });

  it('中分(3)回复应包含"本次小结"指令', () => {
    const query = generateSFBTQuery({ postScore: 3, exerciseName: '正念冥想' });
    expect(query).toContain('本次小结');
    expect(query).toContain('正念冥想');
  });

  it('低分(1-2)回复应包含"本次小结"指令', () => {
    const query = generateSFBTQuery({ postScore: 1, exerciseName: '空椅子技术' });
    expect(query).toContain('本次小结');
    expect(query).toContain('空椅子技术');
    expect(query).toContain('1/5');
  });

  it('总结格式要求包含分隔线', () => {
    const query = generateSFBTQuery({ postScore: 4, exerciseName: '呼吸法' });
    expect(query).toContain('---');
    expect(query).toContain('**本次小结**');
  });
});

// =============================================================================
// P0-2: 统一人格约束
// =============================================================================

describe('P0-2: PERSONA_INVARIANTS', () => {
  it('应包含自称/称谓规范', () => {
    expect(PERSONA_INVARIANTS).toContain('用"我"自称');
    expect(PERSONA_INVARIANTS).toContain('用"你"称呼');
  });

  it('应包含禁用术语列表', () => {
    expect(PERSONA_INVARIANTS).toContain('咨询师');
    expect(PERSONA_INVARIANTS).toContain('来访者');
    expect(PERSONA_INVARIANTS).toContain('心理咨询');
    expect(PERSONA_INVARIANTS).toContain('疗愈');
  });

  it('应包含篇幅和格式要求', () => {
    expect(PERSONA_INVARIANTS).toContain('3-5 句');
    expect(PERSONA_INVARIANTS).toContain('加粗');
  });
});

// =============================================================================
// P0-3: 漏斗事件类型
// =============================================================================

describe('P0-3: 漏斗埋点', () => {
  it('trackFunnel 应为函数', () => {
    expect(typeof trackFunnel).toBe('function');
  });

  it('FunnelEvent 类型应覆盖完整漏斗', () => {
    // 类型检查 — 如果类型定义不对会编译报错
    const events: FunnelEvent[] = [
      'l0_chat_start',
      'l1_skill_recommended',
      'l1_skill_clicked',
      'l1_skill_completed',
      'l2_lab_entered',
    ];
    expect(events).toHaveLength(5);
  });
});

// =============================================================================
// P2-2: 量表触发词收窄 — detectExplicitAssessmentRequest
// =============================================================================

describe('P2-2: detectExplicitAssessmentRequest 收窄', () => {
  it('明确的评估请求应触发', () => {
    expect(detectExplicitAssessmentRequest('做个评估')).toBe(true);
    expect(detectExplicitAssessmentRequest('评估一下')).toBe(true);
    expect(detectExplicitAssessmentRequest('情绪健康度')).toBe(true);
    expect(detectExplicitAssessmentRequest('压力自评')).toBe(true);
    expect(detectExplicitAssessmentRequest('压力指数')).toBe(true);
  });

  it('泛化词不应触发（已收窄）', () => {
    expect(detectExplicitAssessmentRequest('做个测试')).toBe(false);
    expect(detectExplicitAssessmentRequest('测试一下')).toBe(false);
    expect(detectExplicitAssessmentRequest('心理测试')).toBe(false);
    expect(detectExplicitAssessmentRequest('看看我的状态')).toBe(false);
  });

  it('日常消息不应触发', () => {
    expect(detectExplicitAssessmentRequest('今天心情不好')).toBe(false);
    expect(detectExplicitAssessmentRequest('你好')).toBe(false);
    expect(detectExplicitAssessmentRequest('帮我做个呼吸练习')).toBe(false);
  });
});
