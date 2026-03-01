import { describe, it, expect } from 'vitest';
import { hasMetricToken, normalizeStepMetrics, ensureStepHasMetric, sanitizeActionCards } from './sanitize';
import type { ActionCard } from '@/types/chat';

describe('hasMetricToken', () => {
    it.each([
        ['重复3轮', true],
        ['重复3组', true],
        ['重复2遍', true],
        ['重复2回', true],
        ['写下3条担心×1次', true],
        ['闭眼数呼吸1分钟', true],
        ['记录感受', false],
    ])('"%s" → %s', (input, expected) => {
        expect(hasMetricToken(input)).toBe(expected);
    });
});

describe('normalizeStepMetrics', () => {
    it('重复指标：写下3条担心×1次×1次 → 写下3条担心×1次', () => {
        expect(normalizeStepMetrics('写下3条担心×1次×1次')).toBe('写下3条担心×1次');
    });

    it('重复指标：呼吸5次×2次×2次 → 呼吸5次×2次', () => {
        expect(normalizeStepMetrics('呼吸5次×2次×2次')).toBe('呼吸5次×2次');
    });

    it('错位：写下3条×1次平静事×1次 → 写下3条平静事×1次', () => {
        expect(normalizeStepMetrics('写下3条×1次平静事×1次')).toBe('写下3条平静事×1次');
    });

    it('归一化：记录1次1分钟×1次 → 记录1分钟×1次', () => {
        expect(normalizeStepMetrics('记录1次1分钟×1次')).toBe('记录1分钟×1次');
    });

    it('归一化：写下1次1秒×1次 → 写下1秒×1次', () => {
        expect(normalizeStepMetrics('写下1次1秒×1次')).toBe('写下1秒×1次');
    });

    it('错位：标记1个×1次可行动项×1次 → 标记1个可行动项×1次', () => {
        expect(normalizeStepMetrics('标记1个×1次可行动项×1次')).toBe('标记1个可行动项×1次');
    });

    it('正常：写下3条担心×1次 不应改变', () => {
        expect(normalizeStepMetrics('写下3条担心×1次')).toBe('写下3条担心×1次');
    });

    it('正常：闭眼数呼吸1分钟 不应改变', () => {
        expect(normalizeStepMetrics('闭眼数呼吸1分钟')).toBe('闭眼数呼吸1分钟');
    });

    it('中间错位：写下3条×1次具体担心×1次 → 写下3条具体担心×1次', () => {
        expect(normalizeStepMetrics('写下3条×1次具体担心×1次')).toBe('写下3条具体担心×1次');
    });

    it('多个重复：写下3条×1次×1次×1次 → 写下3条×1次', () => {
        expect(normalizeStepMetrics('写下3条×1次×1次×1次')).toBe('写下3条×1次');
    });
});

describe('ensureStepHasMetric', () => {
    describe('不应追加（已有明确指标）', () => {
        it.each([
            ['闭眼数呼吸1分钟'],
            ['深呼吸5次'],
            ['写下3条担心×1次'],
            ['呼吸4-6次×5组'],
            ['深呼吸3次×2轮'],
            ['重复3轮'],
            ['重复3组'],
            ['重复2遍'],
            ['重复2回'],
        ])('"%s" → 保持原样', (input) => {
            expect(ensureStepHasMetric(input)).toBe(input);
        });
    });

    describe('不应追加（仅量词，按门禁口径已满足）', () => {
        it.each([
            ['写下3条担心'],
            ['标记1个可行动项'],
        ])('"%s" → 保持原样', (input) => {
            expect(ensureStepHasMetric(input)).toBe(input);
        });
    });

    describe('应补齐（缺少指标）', () => {
        it('"记录感受" → 补齐后包含指标', () => {
            const result = ensureStepHasMetric('记录感受');
            expect(hasMetricToken(result)).toBe(true);
        });

        it('"思考" → 补齐后包含指标', () => {
            const result = ensureStepHasMetric('思考');
            expect(hasMetricToken(result)).toBe(true);
        });
    });
});

describe('sanitizeActionCards', () => {
    it('重复指标被去重', () => {
        const input: ActionCard[] = [{
            title: '测试卡片',
            steps: ['写下3条担心×1次×1次', '闭眼数呼吸1分钟'],
            when: '',
            effort: 'low',
        }];
        const result = sanitizeActionCards(input);
        expect(result[0].steps).toEqual(['写下3条担心×1次', '闭眼数呼吸1分钟']);
    });

    it('错位指标被修正', () => {
        const input: ActionCard[] = [{
            title: '测试卡片',
            steps: ['写下3条×1次平静事×1次', '深呼吸5次'],
            when: '',
            effort: 'low',
        }];
        const result = sanitizeActionCards(input);
        expect(result[0].steps).toEqual(['写下3条平静事×1次', '深呼吸5次']);
    });

    it('混合场景：正常、重复、错位', () => {
        const input: ActionCard[] = [{
            title: '测试卡片',
            steps: [
                '写下3条担心×1次',
                '标记1个×1次可行动项×1次',
                '呼吸5次×2次×2次',
                '闭眼数呼吸1分钟',
            ],
            when: '',
            effort: 'low',
        }];
        const result = sanitizeActionCards(input);
        expect(result[0].steps).toEqual([
            '写下3条担心×1次',
            '标记1项可行动项×1次',
            '呼吸5次×2次',
            '闭眼数呼吸1分钟',
        ]);
    });
});
