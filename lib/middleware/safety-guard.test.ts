import { describe, it, expect } from 'vitest';
import { runHeuristicSafetyCheck } from './safety-guard';

describe('runHeuristicSafetyCheck', () => {
    it('LLM=normal 时直接返回 normal', () => {
        const result = runHeuristicSafetyCheck('想自杀', 'normal');
        expect(result.safety).toBe('normal');
        expect(result.isDowngraded).toBe(false);
    });

    it('LLM=crisis + 有高危词 "想自杀" → 维持 crisis', () => {
        const result = runHeuristicSafetyCheck('我想自杀', 'crisis');
        expect(result.safety).toBe('crisis');
        expect(result.isDowngraded).toBe(false);
    });

    it('LLM=crisis + 无高危词 "今天好累" → 降级为 normal', () => {
        const result = runHeuristicSafetyCheck('今天好累', 'crisis');
        expect(result.safety).toBe('normal');
        expect(result.isDowngraded).toBe(true);
    });

    it('LLM=urgent + 有高危词 "不想活" → 维持 urgent', () => {
        const result = runHeuristicSafetyCheck('我不想活了', 'urgent');
        expect(result.safety).toBe('urgent');
        expect(result.isDowngraded).toBe(false);
    });

    it('LLM=urgent + 无高危词 → 降级为 normal', () => {
        const result = runHeuristicSafetyCheck('工作压力大', 'urgent');
        expect(result.safety).toBe('normal');
        expect(result.isDowngraded).toBe(true);
    });

    it('"累死了" 不触发高危 (lookbehind 排除 "累")', () => {
        const result = runHeuristicSafetyCheck('今天累死了', 'crisis');
        expect(result.safety).toBe('normal');
        expect(result.isDowngraded).toBe(true);
    });

    it('"笑死了" 不触发高危 (lookbehind 排除 "笑")', () => {
        const result = runHeuristicSafetyCheck('笑死了哈哈', 'crisis');
        expect(result.safety).toBe('normal');
        expect(result.isDowngraded).toBe(true);
    });

    it('"活着没意思" 触发高危', () => {
        const result = runHeuristicSafetyCheck('活着没意思', 'crisis');
        expect(result.safety).toBe('crisis');
        expect(result.isDowngraded).toBe(false);
    });
});
