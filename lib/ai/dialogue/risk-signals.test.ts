import { describe, it, expect } from 'vitest';
import { analyzeRiskSignals, shouldTriggerSafetyCheck } from './risk-signals';

// ====== analyzeRiskSignals ======

describe('analyzeRiskSignals — 危机信号', () => {
    const crisisInputs = [
        '不想活了',
        '我想死',
        '想自杀',
        '想结束生命',
        '离开这个世界',
        '一了百了',
        '死了算了',
        '活不下去了',
        '想伤害自己',
        '我在写遗书',
    ];

    for (const input of crisisInputs) {
        it(`"${input}" → crisis (score=10)`, () => {
            const result = analyzeRiskSignals(input);
            expect(result.level).toBe('crisis');
            expect(result.score).toBe(10);
            expect(result.shouldTriggerSafetyAssessment).toBe(true);
        });
    }
});

describe('analyzeRiskSignals — 高风险信号', () => {
    const highRiskInputs = [
        '感觉没意义',
        '撑不下去了',
        '看不到希望',
        '没人理解我',
        '受不了了',
        '快崩溃了',
        '感觉很绝望',
        '走投无路了',
    ];

    for (const input of highRiskInputs) {
        it(`"${input}" → high (score=7)`, () => {
            const result = analyzeRiskSignals(input);
            expect(result.level).toBe('high');
            expect(result.score).toBe(7);
            expect(result.shouldTriggerSafetyAssessment).toBe(true);
        });
    }
});

describe('analyzeRiskSignals — 中等风险信号', () => {
    const mediumRiskInputs = [
        '最近很焦虑',
        '压力好大',
        '总是失眠',
        '感觉好疲惫',
        '心情很低落',
        '很孤独',
        '好迷茫',
        '好烦',
    ];

    for (const input of mediumRiskInputs) {
        it(`"${input}" → medium (score=4)`, () => {
            const result = analyzeRiskSignals(input);
            expect(result.level).toBe('medium');
            expect(result.score).toBe(4);
            expect(result.shouldTriggerSafetyAssessment).toBe(false);
        });
    }
});

describe('analyzeRiskSignals — 低风险信号', () => {
    const lowRiskInputs = [
        '下班后去运动了',
        '周末和朋友聚会',
        '最近在看一本新书',
        '今天天气不错',
    ];

    for (const input of lowRiskInputs) {
        it(`"${input}" → low`, () => {
            const result = analyzeRiskSignals(input);
            expect(result.level).toBe('low');
            expect(result.score).toBe(0);
            expect(result.shouldTriggerSafetyAssessment).toBe(false);
        });
    }
});

describe('analyzeRiskSignals — 优先级正确', () => {
    it('危机 > 高风险', () => {
        const result = analyzeRiskSignals('撑不下去了，想死');
        expect(result.level).toBe('crisis'); // 不是 high
    });

    it('高风险 > 中等', () => {
        const result = analyzeRiskSignals('很焦虑，看不到希望');
        expect(result.level).toBe('high'); // 不是 medium
    });

    it('无信号 → low', () => {
        const result = analyzeRiskSignals('今天天气真好');
        expect(result.level).toBe('low');
        expect(result.triggeredSignals).toHaveLength(0);
    });
});

describe('analyzeRiskSignals — 日常口语不误判', () => {
    // "累"是 medium，但"累死了"也包含"累"
    it('"累死了" → medium (包含"累")', () => {
        const result = analyzeRiskSignals('累死了');
        expect(result.level).toBe('medium');
    });

    it('纯情绪无风险词 → low', () => {
        const result = analyzeRiskSignals('今天开会讨论了新项目');
        expect(result.level).toBe('low');
    });
});

// ====== shouldTriggerSafetyCheck ======

describe('shouldTriggerSafetyCheck', () => {
    it('crisis → 立即触发', () => {
        const risk = analyzeRiskSignals('想死');
        const { shouldTrigger } = shouldTriggerSafetyCheck(risk, 1);
        expect(shouldTrigger).toBe(true);
    });

    it('crisis 在第 1 轮 → 也触发', () => {
        const risk = analyzeRiskSignals('不想活了');
        const { shouldTrigger } = shouldTriggerSafetyCheck(risk, 1);
        expect(shouldTrigger).toBe(true);
    });

    it('high + 高情绪分 → 触发', () => {
        const risk = analyzeRiskSignals('看不到希望');
        const { shouldTrigger } = shouldTriggerSafetyCheck(risk, 3, 8);
        expect(shouldTrigger).toBe(true);
    });

    it('high + 低情绪分 + 早期轮次 → 不触发', () => {
        const risk = analyzeRiskSignals('看不到希望');
        const { shouldTrigger } = shouldTriggerSafetyCheck(risk, 2, 4);
        expect(shouldTrigger).toBe(false);
    });

    it('high + 第 5 轮 → 触发', () => {
        const risk = analyzeRiskSignals('看不到希望');
        const { shouldTrigger } = shouldTriggerSafetyCheck(risk, 5);
        expect(shouldTrigger).toBe(true);
    });

    it('medium + 第 7 轮 + 高情绪分 → 触发', () => {
        const risk = analyzeRiskSignals('很焦虑');
        const { shouldTrigger } = shouldTriggerSafetyCheck(risk, 7, 7);
        expect(shouldTrigger).toBe(true);
    });

    it('medium + 第 3 轮 → 不触发', () => {
        const risk = analyzeRiskSignals('很焦虑');
        const { shouldTrigger } = shouldTriggerSafetyCheck(risk, 3);
        expect(shouldTrigger).toBe(false);
    });

    it('low → 不触发', () => {
        const risk = analyzeRiskSignals('今天天气真好');
        const { shouldTrigger } = shouldTriggerSafetyCheck(risk, 10, 9);
        expect(shouldTrigger).toBe(false);
    });

    it('返回 reason 字段', () => {
        const risk = analyzeRiskSignals('想死');
        const { reason } = shouldTriggerSafetyCheck(risk, 1);
        expect(reason.length).toBeGreaterThan(0);
    });
});
