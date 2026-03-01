import { describe, it, expect } from 'vitest';
import {
    calculateMemoryStrength,
    updateAfterAccess,
    shouldForget,
    rankByStrength,
    getMemoriesToPrune,
} from './forgetting-curve';
import { createMemory, createPermanentMemory, createSlowDecayMemory } from '@/tests/helpers/fixtures';

describe('calculateMemoryStrength', () => {
    it('永久记忆 (personal_context) 始终返回 1.0', () => {
        const memory = createPermanentMemory({ accessedAt: new Date('2023-01-01') });
        const now = new Date('2024-01-01');
        expect(calculateMemoryStrength(memory, now)).toBe(1.0);
    });

    it('永久记忆 (trigger_warning) 始终返回 1.0', () => {
        const memory = createMemory({ topic: 'trigger_warning', accessedAt: new Date('2020-01-01') });
        const now = new Date('2024-01-01');
        expect(calculateMemoryStrength(memory, now)).toBe(1.0);
    });

    it('慢速衰减 (therapy_progress): 刚访问 → ≈1.0', () => {
        const baseDate = new Date('2024-01-01T00:00:00Z');
        const memory = createSlowDecayMemory({ accessedAt: baseDate });
        expect(calculateMemoryStrength(memory, baseDate)).toBeCloseTo(1.0, 2);
    });

    it('慢速衰减: 90天后 → ≈0.5 (半衰期)', () => {
        const baseDate = new Date('2024-01-01T00:00:00Z');
        const memory = createSlowDecayMemory({ accessedAt: baseDate });
        const ninetyDaysLater = new Date('2024-03-31T00:00:00Z');
        expect(calculateMemoryStrength(memory, ninetyDaysLater)).toBeCloseTo(0.5, 1);
    });

    it('慢速衰减: 180天后 → ≈0.25', () => {
        const baseDate = new Date('2024-01-01T00:00:00Z');
        const memory = createSlowDecayMemory({ accessedAt: baseDate });
        const oneEightyDaysLater = new Date('2024-06-29T00:00:00Z');
        expect(calculateMemoryStrength(memory, oneEightyDaysLater)).toBeCloseTo(0.25, 1);
    });

    it('标准衰减 (emotional_pattern): stabilityFactor=1, 刚访问 → ≈1.0', () => {
        const baseDate = new Date('2024-01-01T00:00:00Z');
        const memory = createMemory({ accessedAt: baseDate, stabilityFactor: 1.0 });
        expect(calculateMemoryStrength(memory, baseDate)).toBeCloseTo(1.0, 2);
    });

    it('标准衰减: stabilityFactor=1, 3天后 → ≈0.37', () => {
        const baseDate = new Date('2024-01-01T00:00:00Z');
        const memory = createMemory({ accessedAt: baseDate, stabilityFactor: 1.0 });
        const threeDaysLater = new Date('2024-01-04T00:00:00Z');
        // e^(-3 / (3 * 1)) = e^(-1) ≈ 0.368
        const strength = calculateMemoryStrength(memory, threeDaysLater);
        expect(strength).toBeCloseTo(0.368, 1);
    });

    it('标准衰减: stabilityFactor=5, 3天后 → 衰减更慢 (≈0.82)', () => {
        const baseDate = new Date('2024-01-01T00:00:00Z');
        const memory = createMemory({ accessedAt: baseDate, stabilityFactor: 5.0 });
        const threeDaysLater = new Date('2024-01-04T00:00:00Z');
        // e^(-3 / (3 * 5)) = e^(-0.2) ≈ 0.819
        const strength = calculateMemoryStrength(memory, threeDaysLater);
        expect(strength).toBeCloseTo(0.819, 1);
    });

    it('返回值始终在 [0, 1] 范围内', () => {
        // 极端情况：非常久远的记忆
        const memory = createMemory({
            accessedAt: new Date('2000-01-01'),
            stabilityFactor: 0.01,
        });
        const now = new Date('2024-01-01');
        const strength = calculateMemoryStrength(memory, now);
        expect(strength).toBeGreaterThanOrEqual(0);
        expect(strength).toBeLessThanOrEqual(1);
    });
});

describe('updateAfterAccess', () => {
    it('稳定性因子 × 1.5', () => {
        const result = updateAfterAccess(2.0, 3);
        expect(result.stabilityFactor).toBe(3.0);
    });

    it('访问次数 + 1', () => {
        const result = updateAfterAccess(2.0, 3);
        expect(result.accessCount).toBe(4);
    });

    it('记忆强度重置为 1.0', () => {
        const result = updateAfterAccess(2.0, 3);
        expect(result.memoryStrength).toBe(1.0);
    });

    it('不超过 maxStability=30 (25 * 1.5 = 37.5 → 30)', () => {
        const result = updateAfterAccess(25, 10);
        expect(result.stabilityFactor).toBe(30);
    });
});

describe('shouldForget', () => {
    it('永久记忆 → false', () => {
        const memory = createPermanentMemory({ accessedAt: new Date('2000-01-01') });
        expect(shouldForget(memory)).toBe(false);
    });

    it('强度 < 0.1 → true', () => {
        // stabilityFactor=1, decayConstant=3 → need large daysSinceAccess
        // e^(-t/(3*1)) < 0.1 → t > 3*ln(10) ≈ 6.9 days
        const memory = createMemory({
            accessedAt: new Date('2020-01-01'),
            stabilityFactor: 0.1,
        });
        expect(shouldForget(memory)).toBe(true);
    });

    it('强度 > 0.1 → false', () => {
        const now = new Date();
        const memory = createMemory({
            accessedAt: now,
            stabilityFactor: 5.0,
        });
        expect(shouldForget(memory)).toBe(false);
    });

    it('自定义阈值生效', () => {
        // 刚访问的记忆强度为 1.0，设置阈值 0.99 也不应该被遗忘
        const now = new Date();
        const memory = createMemory({ accessedAt: now, stabilityFactor: 1.0 });
        expect(shouldForget(memory, 0.99)).toBe(false);

        // 但设置超高阈值 1.1 → 任何记忆都低于此值
        expect(shouldForget(memory, 1.1)).toBe(true);
    });
});

describe('rankByStrength', () => {
    it('按强度降序排列', () => {
        const now = new Date();
        const memories = [
            createMemory({ id: 'old', accessedAt: new Date('2020-01-01'), stabilityFactor: 1.0 }),
            createMemory({ id: 'recent', accessedAt: now, stabilityFactor: 1.0 }),
            createMemory({ id: 'mid', accessedAt: new Date('2024-06-01'), stabilityFactor: 1.0 }),
        ];
        const ranked = rankByStrength(memories);
        expect(ranked[0].id).toBe('recent');
        expect(ranked[ranked.length - 1].id).toBe('old');
        // Verify descending order
        for (let i = 1; i < ranked.length; i++) {
            expect(ranked[i - 1].calculatedStrength).toBeGreaterThanOrEqual(ranked[i].calculatedStrength);
        }
    });

    it('空数组 → 空数组', () => {
        expect(rankByStrength([])).toEqual([]);
    });
});

describe('getMemoriesToPrune', () => {
    it('返回低于阈值的记忆 ID', () => {
        const memories = [
            createMemory({ id: 'weak', accessedAt: new Date('2020-01-01'), stabilityFactor: 0.1 }),
            createMemory({ id: 'strong', accessedAt: new Date(), stabilityFactor: 5.0 }),
        ];
        const ids = getMemoriesToPrune(memories);
        expect(ids).toContain('weak');
        expect(ids).not.toContain('strong');
    });

    it('永久记忆不在清理列表中', () => {
        const memories = [
            createPermanentMemory({ id: 'perm', accessedAt: new Date('2000-01-01') }),
            createMemory({ id: 'weak', accessedAt: new Date('2020-01-01'), stabilityFactor: 0.1 }),
        ];
        const ids = getMemoriesToPrune(memories);
        expect(ids).not.toContain('perm');
    });
});
