import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTime, generateId } from './format';

describe('formatTime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('30秒前 → "刚刚"', () => {
        const timestamp = new Date('2024-06-15T11:59:30Z').toISOString();
        expect(formatTime(timestamp)).toBe('刚刚');
    });

    it('5分钟前 → "5分钟前"', () => {
        const timestamp = new Date('2024-06-15T11:55:00Z').toISOString();
        expect(formatTime(timestamp)).toBe('5分钟前');
    });

    it('3小时前 → "3小时前"', () => {
        const timestamp = new Date('2024-06-15T09:00:00Z').toISOString();
        expect(formatTime(timestamp)).toBe('3小时前');
    });

    it('2天前 → "2天前"', () => {
        const timestamp = new Date('2024-06-13T12:00:00Z').toISOString();
        expect(formatTime(timestamp)).toBe('2天前');
    });

    it('10天前 → 返回日期格式', () => {
        const timestamp = new Date('2024-06-05T12:00:00Z').toISOString();
        const result = formatTime(timestamp);
        expect(result).not.toContain('天前');
    });

    it('刚好1分钟前 → "1分钟前"', () => {
        const timestamp = new Date('2024-06-15T11:59:00Z').toISOString();
        expect(formatTime(timestamp)).toBe('1分钟前');
    });
});

describe('generateId', () => {
    it('格式匹配 timestamp-random', () => {
        const id = generateId();
        expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it('两次调用生成不同ID', () => {
        const id1 = generateId();
        const id2 = generateId();
        expect(id1).not.toBe(id2);
    });
});
