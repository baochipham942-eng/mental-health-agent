/**
 * 意图优先回复策略测试
 *
 * 覆盖：
 * 1. 6 种 dialogueIntent 各自的回复策略注入
 * 2. 固定共情模板/加粗硬约束已移除
 * 3. 评测维度与新回复形态对齐（persona-bold 移除、新维度就位）
 */

import { describe, it, expect } from 'vitest';
import {
  IDENTITY_PROMPT,
  PERSONA_INVARIANTS,
  SUPPORT_PROMPT_RAW,
  INTENT_REPLY_STRATEGIES,
  buildIntentReplyGuidance,
} from './prompts';
import { SUPPORT_PROMPT } from './support';
import { WEAK_TRIAGE_PROMPT } from './agents/triage-agent';
import { GRADER_REGISTRY } from '@/lib/eval/config';

describe('意图回复策略（buildIntentReplyGuidance）', () => {
  it('倾诉（sharing）：先回应事实和感受，情绪映射有条件', () => {
    const p = buildIntentReplyGuidance('sharing');
    expect(p).toContain('事实和感受');
    expect(p).toContain('明确表达了情绪');
    expect(p).not.toContain('必须');
  });

  it('求建议（seeking_solutions）：首句直接给最小可行动建议+理由', () => {
    const p = buildIntentReplyGuidance('seeking_solutions');
    expect(p).toContain('最小可行动的建议');
    expect(p).toContain('理由');
    expect(p).toContain('不要先铺垫情绪分析');
  });

  it('对话排练（rehearsal）：直接进角色，不做情绪分析', () => {
    const p = buildIntentReplyGuidance('rehearsal');
    expect(p).toContain('直接进入角色');
    expect(p).toContain('不做情绪分析');
  });

  it('事实问题（factual_question）：事实优先，不含强制情绪映射指令', () => {
    const p = buildIntentReplyGuidance('factual_question');
    expect(p).toContain('事实优先');
    expect(p).toContain('不贴情绪标签');
    expect(p).not.toContain('准确映射用户的情绪');
  });

  it('正向分享（positive_sharing）：正常聊天，不强行深挖', () => {
    const p = buildIntentReplyGuidance('positive_sharing');
    expect(p).toContain('为 TA 高兴');
    expect(p).toContain('不强行深挖');
  });

  it('结束信号（wrapping_up）：简短收尾，不追加任务', () => {
    const p = buildIntentReplyGuidance('wrapping_up');
    expect(p).toContain('收尾');
    expect(p).toContain('不追问、不追加新建议或任务');
  });

  it('未知/缺失 intent：兜底策略仍是意图优先+无依据不推断情绪', () => {
    for (const intent of [undefined, null, 'nonsense']) {
      const p = buildIntentReplyGuidance(intent as any);
      expect(p).toContain('首句直接回应');
      expect(p).toContain('不做无依据的情绪推断');
    }
  });

  it('8 种已知 intent 都有独立策略文案', () => {
    expect(Object.keys(INTENT_REPLY_STRATEGIES)).toHaveLength(8);
  });
});

describe('固定模板硬约束已移除', () => {
  it('IDENTITY_PROMPT 不再强制加粗与分段', () => {
    expect(IDENTITY_PROMPT).not.toContain('必须包含至少 1 处加粗');
    expect(IDENTITY_PROMPT).not.toContain('必须使用空行分段');
    expect(IDENTITY_PROMPT).not.toContain('格式硬性要求');
  });

  it('PERSONA_INVARIANTS 保留人格约束但不含加粗要求', () => {
    expect(PERSONA_INVARIANTS).toContain('用"我"自称');
    expect(PERSONA_INVARIANTS).toContain('咨询师');
    expect(PERSONA_INVARIANTS).not.toContain('加粗');
  });

  it('SUPPORT_PROMPT 不再要求固定的"第 1-2 句情绪映射"结构', () => {
    for (const prompt of [SUPPORT_PROMPT, SUPPORT_PROMPT_RAW]) {
      expect(prompt).not.toContain('回复结构（必须遵循）');
      expect(prompt).not.toContain('第 1-2 句');
      expect(prompt).toContain('只在用户明确表达情绪');
    }
  });
});

describe('triage dialogueIntent 扩展', () => {
  it('WEAK_TRIAGE_PROMPT 覆盖新增三类意图', () => {
    expect(WEAK_TRIAGE_PROMPT).toContain('"rehearsal"');
    expect(WEAK_TRIAGE_PROMPT).toContain('"factual_question"');
    expect(WEAK_TRIAGE_PROMPT).toContain('"positive_sharing"');
  });
});

describe('评测维度对齐', () => {
  const ids = GRADER_REGISTRY.map(d => d.id);

  it('persona-bold 加粗评分项已移除', () => {
    expect(ids).not.toContain('persona-bold');
  });

  it('新增 5 个意图对齐维度', () => {
    for (const id of [
      'intent-completion',
      'first-sentence-utility',
      'no-unfounded-emotion',
      'advice-actionability',
      'de-medicalization',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('参与评分的维度权重合计约为 1', () => {
    const total = GRADER_REGISTRY
      .filter(d => d.type !== 'info')
      .reduce((s, d) => s + d.weight, 0);
    expect(total).toBeCloseTo(1.0, 2);
  });
});
