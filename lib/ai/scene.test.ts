import { describe, expect, it } from 'vitest';
import { buildFallbackSceneContext, buildSceneSystemInjection, resolveSceneContext } from './scene';

describe('scene context v1', () => {
  it('优先采用 triage 节点给出的职场场景', () => {
    const scene = resolveSceneContext({
      message: '和开发讨论技术方案后，字段 domain 要调整，结果让我去写卡。',
      triageScene: {
        id: 'workplace_boundary',
        role: 'knowledge_worker',
        intent: 'sensemaking',
        confidence: 0.78,
      },
    });

    expect(scene.id).toBe('workplace_boundary');
    expect(scene.source).toBe('triage');
    expect(scene.confidence).toBe(0.78);
  });

  it('支持学生场景', () => {
    const scene = resolveSceneContext({
      message: '导师一直催论文，我又怕延毕。',
      triageScene: {
        id: 'student_pressure',
        role: 'student',
        intent: 'prep',
        confidence: 0.73,
      },
    });

    expect(scene.id).toBe('student_pressure');
    expect(scene.role).toBe('student');
  });

  it('triage 缺失时只保守兜底 general_support', () => {
    const scene = buildFallbackSceneContext();
    expect(scene.id).toBe('general_support');
    expect(scene.source).toBe('fallback');
  });

  it('为明确场景生成 playbook 注入', () => {
    const injection = buildSceneSystemInjection(resolveSceneContext({
      message: '老板一直把模糊需求扔给我。',
      triageScene: {
        id: 'workplace_boundary',
        role: 'knowledge_worker',
        intent: 'vent',
        confidence: 0.8,
      },
    }));

    expect(injection).toContain('场景理解（v1）');
    expect(injection).toContain('职责边界');
  });
});
