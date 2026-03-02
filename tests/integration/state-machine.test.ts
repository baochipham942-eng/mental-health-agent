/**
 * 状态机驱动对话路由测试
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateTransition,
  createInitialContext,
  updateSCEBProgress,
  getOverallProgress,
  generateStateMachinePrompt,
  restoreContext,
  type DialogueContext,
  type MachineState,
} from '@/lib/ai/dialogue/state-machine';
import type { QuickAnalysis } from '@/lib/ai/groq';

// 辅助：创建测试用 QuickAnalysis
function makeAnalysis(overrides: Partial<QuickAnalysis> & { dialogueIntent?: string } = {}): QuickAnalysis {
  return {
    safety: 'normal',
    safetyReasoning: 'test',
    stateReasoning: 'test reasoning',
    emotion: { label: '平静', score: 3 },
    route: 'support',
    needsValidation: false,
    adaptiveMode: 'companion',
    personaReasoning: 'test',
    memoryCheck: '无',
    ...overrides,
  } as QuickAnalysis;
}

function makeContext(overrides: Partial<DialogueContext> = {}): DialogueContext {
  return {
    ...createInitialContext(),
    ...overrides,
  };
}

// =============================================================================
// evaluateTransition - 正向状态转移
// =============================================================================

describe('evaluateTransition', () => {
  describe('greeting → exploration', () => {
    it('should transition when user starts sharing (emotion > 0)', () => {
      const ctx = makeContext({ state: 'greeting', turn: 1 });
      const analysis = makeAnalysis({ emotion: { label: '压力', score: 5 } });
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('exploration');
      expect(result.stateChanged).toBe(true);
    });

    it('should transition when dialogueIntent is sharing', () => {
      const ctx = makeContext({ state: 'greeting', turn: 1 });
      const analysis = makeAnalysis({ dialogueIntent: 'sharing' } as any);
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('exploration');
    });

    it('should auto-transition after turn 3', () => {
      const ctx = makeContext({ state: 'greeting', turn: 3 });
      const analysis = makeAnalysis({ emotion: { label: '未表达', score: 0 } });
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('exploration');
    });

    it('should stay in greeting if no triggers', () => {
      const ctx = makeContext({ state: 'greeting', turn: 1 });
      const analysis = makeAnalysis({ emotion: { label: '未表达', score: 0 } });
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('greeting');
      expect(result.stateChanged).toBe(false);
    });
  });

  describe('exploration → deepening', () => {
    it('should transition when SCEB progress >= 40%', () => {
      const ctx = makeContext({
        state: 'exploration',
        turn: 3,
        scebProgress: { S: 50, C: 50, E: 50, B: 25 },
      });
      const analysis = makeAnalysis();
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('deepening');
    });

    it('should transition when turn >= 5', () => {
      const ctx = makeContext({ state: 'exploration', turn: 5 });
      const analysis = makeAnalysis();
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('deepening');
    });

    it('should stay in exploration with low progress and early turn', () => {
      const ctx = makeContext({ state: 'exploration', turn: 2, scebProgress: { S: 25, C: 0, E: 0, B: 0 } });
      const analysis = makeAnalysis();
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('exploration');
    });
  });

  describe('deepening → coping', () => {
    it('should transition when SCEB >= 70% and safety normal', () => {
      const ctx = makeContext({
        state: 'deepening',
        turn: 6,
        scebProgress: { S: 75, C: 75, E: 75, B: 75 },
      });
      const analysis = makeAnalysis();
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('coping');
    });

    it('should transition when turn >= 8 and safety normal', () => {
      const ctx = makeContext({ state: 'deepening', turn: 8 });
      const analysis = makeAnalysis();
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('coping');
    });

    it('should transition early when user seeks solutions', () => {
      const ctx = makeContext({
        state: 'deepening',
        turn: 5,
        scebProgress: { S: 50, C: 50, E: 50, B: 50 },
      });
      const analysis = makeAnalysis({ dialogueIntent: 'seeking_solutions' } as any);
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('coping');
    });

    it('should not transition when safety is not normal', () => {
      const ctx = makeContext({
        state: 'deepening',
        turn: 8,
        scebProgress: { S: 75, C: 75, E: 75, B: 75 },
      });
      const analysis = makeAnalysis({ safety: 'urgent' });
      const result = evaluateTransition(ctx, analysis);
      // Crisis is handled by route.ts, state stays
      expect(result.stateChanged).toBe(false);
    });
  });

  describe('coping → wrap_up', () => {
    it('should transition when intent is wrapping_up', () => {
      const ctx = makeContext({ state: 'coping', turn: 9 });
      const analysis = makeAnalysis({ dialogueIntent: 'wrapping_up' } as any);
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('wrap_up');
    });

    it('should transition when turn >= 11', () => {
      const ctx = makeContext({ state: 'coping', turn: 11 });
      const analysis = makeAnalysis();
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('wrap_up');
    });

    it('should transition when emotion trajectory improves', () => {
      const ctx = makeContext({
        state: 'coping',
        turn: 8,
        emotionTrajectory: [7, 5, 3],
      });
      const analysis = makeAnalysis();
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('wrap_up');
    });
  });

  describe('wrap_up (terminal)', () => {
    it('should stay in wrap_up', () => {
      const ctx = makeContext({ state: 'wrap_up', turn: 12 });
      const analysis = makeAnalysis();
      const result = evaluateTransition(ctx, analysis);
      expect(result.nextState).toBe('wrap_up');
      expect(result.stateChanged).toBe(false);
    });
  });

  describe('crisis override', () => {
    it('should not change state on crisis (handled by route.ts)', () => {
      const states: MachineState[] = ['greeting', 'exploration', 'deepening', 'coping', 'wrap_up'];
      for (const state of states) {
        const ctx = makeContext({ state, turn: 3 });
        const analysis = makeAnalysis({ safety: 'crisis' });
        const result = evaluateTransition(ctx, analysis);
        expect(result.stateChanged).toBe(false);
        expect(result.reason).toContain('crisis');
      }
    });

    it('should not change state on urgent', () => {
      const ctx = makeContext({ state: 'exploration', turn: 3 });
      const analysis = makeAnalysis({ safety: 'urgent' });
      const result = evaluateTransition(ctx, analysis);
      expect(result.stateChanged).toBe(false);
    });
  });
});

// =============================================================================
// updateSCEBProgress
// =============================================================================

describe('updateSCEBProgress', () => {
  it('should increase S when situation keywords detected', () => {
    const current = { S: 0, C: 0, E: 0, B: 0 };
    const analysis = makeAnalysis({ stateReasoning: '用户描述了具体事件' });
    const result = updateSCEBProgress(current, analysis, '最近工作上发生了一些事');
    expect(result.S).toBeGreaterThan(0);
  });

  it('should increase E when emotion detected', () => {
    const current = { S: 0, C: 0, E: 0, B: 0 };
    const analysis = makeAnalysis({ emotion: { label: '焦虑', score: 7 } });
    const result = updateSCEBProgress(current, analysis, '我很焦虑');
    expect(result.E).toBeGreaterThan(0);
  });

  it('should increase C when cognition keywords detected', () => {
    const current = { S: 0, C: 0, E: 0, B: 0 };
    const analysis = makeAnalysis({ stateReasoning: '用户表达了想法' });
    const result = updateSCEBProgress(current, analysis, '我觉得自己不够好');
    expect(result.C).toBeGreaterThan(0);
  });

  it('should not decrease existing progress', () => {
    const current = { S: 75, C: 50, E: 50, B: 50 };
    const analysis = makeAnalysis();
    const result = updateSCEBProgress(current, analysis, '今天天气不错');
    expect(result.S).toBeGreaterThanOrEqual(75);
    expect(result.C).toBeGreaterThanOrEqual(50);
  });

  it('should cap at 100', () => {
    const current = { S: 100, C: 100, E: 100, B: 100 };
    const analysis = makeAnalysis({ stateReasoning: '用户描述了事件和想法', emotion: { label: '焦虑', score: 8 } });
    const result = updateSCEBProgress(current, analysis, '最近发生了很多事，我觉得自己应付不来');
    expect(result.S).toBe(100);
    expect(result.C).toBe(100);
    expect(result.E).toBe(100);
    expect(result.B).toBe(100);
  });
});

// =============================================================================
// getOverallProgress
// =============================================================================

describe('getOverallProgress', () => {
  it('should calculate average', () => {
    expect(getOverallProgress({ S: 100, C: 100, E: 100, B: 100 })).toBe(100);
    expect(getOverallProgress({ S: 0, C: 0, E: 0, B: 0 })).toBe(0);
    expect(getOverallProgress({ S: 40, C: 40, E: 40, B: 40 })).toBe(40);
    expect(getOverallProgress({ S: 50, C: 25, E: 75, B: 50 })).toBe(50);
  });
});

// =============================================================================
// generateStateMachinePrompt
// =============================================================================

describe('generateStateMachinePrompt', () => {
  it('should include state and turn info', () => {
    const ctx = makeContext({ state: 'exploration', turn: 3 });
    const prompt = generateStateMachinePrompt(ctx);
    expect(prompt).toContain('exploration');
    expect(prompt).toContain('3');
  });

  it('should include SCEB progress', () => {
    const ctx = makeContext({
      scebProgress: { S: 50, C: 25, E: 75, B: 0 },
    });
    const prompt = generateStateMachinePrompt(ctx);
    expect(prompt).toContain('S:50%');
    expect(prompt).toContain('C:25%');
  });

  it('should note active questionnaire', () => {
    const ctx = makeContext({
      questionnaireActive: { type: 'phq9', currentQ: 3 },
    });
    const prompt = generateStateMachinePrompt(ctx);
    expect(prompt).toContain('PHQ9');
    expect(prompt).toContain('4');
  });
});

// =============================================================================
// restoreContext
// =============================================================================

describe('restoreContext', () => {
  it('should return null for invalid input', () => {
    expect(restoreContext(null)).toBeNull();
    expect(restoreContext(undefined)).toBeNull();
    expect(restoreContext({})).toBeNull();
    expect(restoreContext({ dialogueContext: {} })).toBeNull();
  });

  it('should restore valid context', () => {
    const meta = {
      dialogueContext: {
        state: 'deepening',
        turn: 5,
        scebProgress: { S: 50, C: 30, E: 60, B: 10 },
        emotionTrajectory: [7, 5, 4],
      },
    };
    const ctx = restoreContext(meta);
    expect(ctx).not.toBeNull();
    expect(ctx!.state).toBe('deepening');
    expect(ctx!.turn).toBe(5);
    expect(ctx!.scebProgress.S).toBe(50);
    expect(ctx!.emotionTrajectory).toEqual([7, 5, 4]);
  });

  it('should handle missing optional fields', () => {
    const meta = {
      dialogueContext: {
        state: 'exploration',
        turn: 2,
      },
    };
    const ctx = restoreContext(meta);
    expect(ctx).not.toBeNull();
    expect(ctx!.scebProgress).toEqual({ S: 0, C: 0, E: 0, B: 0 });
    expect(ctx!.emotionTrajectory).toEqual([]);
  });
});
