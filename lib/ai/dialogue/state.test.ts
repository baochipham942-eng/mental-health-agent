import { describe, it, expect } from 'vitest';
import {
    inferPhase,
    getAllowedTopics,
    getForbiddenActions,
    generatePhaseContextPrompt,
    calculateTurn,
    createInitialState,
    updateState,
} from './state';
import type { RiskSignalResult } from './risk-signals';

// ====== inferPhase ======

describe('inferPhase', () => {
    it('turn 1 → initial_contact', () => {
        expect(inferPhase(1, false)).toBe('initial_contact');
    });

    it('turn 2 → initial_contact', () => {
        expect(inferPhase(2, false)).toBe('initial_contact');
    });

    it('turn 3 → rapport_building', () => {
        expect(inferPhase(3, false)).toBe('rapport_building');
    });

    it('turn 4 → rapport_building', () => {
        expect(inferPhase(4, false)).toBe('rapport_building');
    });

    it('turn 5 → exploration', () => {
        expect(inferPhase(5, false)).toBe('exploration');
    });

    it('turn 7 → exploration', () => {
        expect(inferPhase(7, false)).toBe('exploration');
    });

    it('turn 8 → conclusion', () => {
        expect(inferPhase(8, false)).toBe('conclusion');
    });

    it('turn 20 → conclusion', () => {
        expect(inferPhase(20, false)).toBe('conclusion');
    });

    it('任何轮次 + riskTriggered → safety_check', () => {
        expect(inferPhase(1, true)).toBe('safety_check');
        expect(inferPhase(5, true)).toBe('safety_check');
        expect(inferPhase(10, true)).toBe('safety_check');
    });
});

// ====== getAllowedTopics ======

describe('getAllowedTopics', () => {
    it('initial_contact → 只允许表层话题', () => {
        const topics = getAllowedTopics('initial_contact');
        expect(topics).toContain('situation');
        expect(topics).toContain('surface_emotion');
        expect(topics).not.toContain('cognition');
        expect(topics).not.toContain('behavior');
    });

    it('exploration → 全量 SCEB', () => {
        const topics = getAllowedTopics('exploration');
        expect(topics).toContain('situation');
        expect(topics).toContain('cognition');
        expect(topics).toContain('emotion');
        expect(topics).toContain('behavior');
    });

    it('safety_check → 安全相关', () => {
        const topics = getAllowedTopics('safety_check');
        expect(topics).toContain('safety');
        expect(topics).toContain('coping');
    });

    it('conclusion → 总结与资源', () => {
        const topics = getAllowedTopics('conclusion');
        expect(topics).toContain('summary');
        expect(topics).toContain('next_steps');
    });
});

// ====== getForbiddenActions ======

describe('getForbiddenActions', () => {
    it('initial_contact → 禁止安全评估和深度探索', () => {
        const forbidden = getForbiddenActions('initial_contact');
        expect(forbidden).toContain('safety_assessment');
        expect(forbidden).toContain('deep_cognition_probe');
    });

    it('safety_check → 禁止转移话题和淡化', () => {
        const forbidden = getForbiddenActions('safety_check');
        expect(forbidden).toContain('topic_change');
        expect(forbidden).toContain('minimizing');
    });

    it('conclusion → 禁止引入新话题', () => {
        const forbidden = getForbiddenActions('conclusion');
        expect(forbidden).toContain('new_topic_introduction');
    });

    it('exploration → 禁止过早结论', () => {
        expect(getForbiddenActions('exploration')).toContain('premature_conclusion');
    });
});

// ====== generatePhaseContextPrompt ======

describe('generatePhaseContextPrompt', () => {
    it('initial_contact → 包含"严禁"安全评估', () => {
        const state = createInitialState();
        const prompt = generatePhaseContextPrompt(state);
        expect(prompt).toContain('严禁');
        expect(prompt).toContain('第 1 轮');
    });

    it('exploration → 包含"温和地探索"', () => {
        const state = {
            ...createInitialState(),
            turn: 5,
            phase: 'exploration' as const,
        };
        const prompt = generatePhaseContextPrompt(state);
        expect(prompt).toContain('温和地探索');
    });

    it('safety_check → 包含"风险信号"', () => {
        const state = {
            ...createInitialState(),
            turn: 3,
            phase: 'safety_check' as const,
        };
        const prompt = generatePhaseContextPrompt(state);
        expect(prompt).toContain('风险信号');
    });

    it('包含允许话题列表', () => {
        const state = createInitialState();
        const prompt = generatePhaseContextPrompt(state);
        expect(prompt).toContain('允许话题');
    });
});

// ====== calculateTurn ======

describe('calculateTurn', () => {
    it('空历史 → 第 1 轮', () => {
        expect(calculateTurn([])).toBe(1);
    });

    it('1 条 user → 第 2 轮', () => {
        expect(calculateTurn([{ role: 'user' }])).toBe(2);
    });

    it('user + assistant 交替 → 按 user 计数', () => {
        const history = [
            { role: 'user' },
            { role: 'assistant' },
            { role: 'user' },
            { role: 'assistant' },
        ];
        expect(calculateTurn(history)).toBe(3); // 2 user + 1
    });

    it('system 消息不计入', () => {
        const history = [
            { role: 'system' },
            { role: 'user' },
            { role: 'assistant' },
        ];
        expect(calculateTurn(history)).toBe(2);
    });
});

// ====== createInitialState ======

describe('createInitialState', () => {
    it('初始状态正确', () => {
        const state = createInitialState();
        expect(state.turn).toBe(1);
        expect(state.phase).toBe('initial_contact');
        expect(state.sceb).toEqual({
            situation: false,
            cognition: false,
            emotion: false,
            behavior: false,
        });
        expect(state.riskHistory).toEqual([]);
        expect(state.highestRisk).toBe('low');
        expect(state.safetyCheckCompleted).toBe(false);
    });
});

// ====== updateState ======

describe('updateState', () => {
    const lowRisk: RiskSignalResult = {
        level: 'low',
        score: 0,
        triggeredSignals: [],
        shouldTriggerSafetyAssessment: false,
    };

    const crisisRisk: RiskSignalResult = {
        level: 'crisis',
        score: 10,
        triggeredSignals: ['[CRISIS] 想死'],
        shouldTriggerSafetyAssessment: true,
    };

    it('正常推进 → turn+1, phase 更新', () => {
        const state = createInitialState();
        const newState = updateState(state, lowRisk);
        expect(newState.turn).toBe(2);
        expect(newState.phase).toBe('initial_contact'); // turn 2 还在 initial
    });

    it('连续推进到 rapport_building', () => {
        let state = createInitialState();
        state = updateState(state, lowRisk); // turn 2
        state = updateState(state, lowRisk); // turn 3
        expect(state.turn).toBe(3);
        expect(state.phase).toBe('rapport_building');
    });

    it('连续推进到 exploration', () => {
        let state = createInitialState();
        for (let i = 0; i < 4; i++) {
            state = updateState(state, lowRisk);
        }
        expect(state.turn).toBe(5);
        expect(state.phase).toBe('exploration');
    });

    it('危机触发 → safety_check', () => {
        const state = createInitialState();
        const newState = updateState(state, crisisRisk);
        expect(newState.phase).toBe('safety_check');
        expect(newState.highestRisk).toBe('crisis');
    });

    it('riskHistory 累积', () => {
        let state = createInitialState();
        state = updateState(state, lowRisk);
        state = updateState(state, { ...lowRisk, level: 'medium' });
        state = updateState(state, crisisRisk);
        expect(state.riskHistory).toEqual(['low', 'medium', 'crisis']);
        expect(state.highestRisk).toBe('crisis');
    });

    it('highestRisk 只升不降', () => {
        let state = createInitialState();
        state = updateState(state, { ...lowRisk, level: 'high' });
        state = updateState(state, lowRisk); // 回到 low
        expect(state.highestRisk).toBe('high'); // 仍是 high
    });
});
