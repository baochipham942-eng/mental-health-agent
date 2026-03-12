import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quickCrisisKeywordCheck, classifyCrisisIntent } from './crisis-classifier';

vi.mock('@/lib/ai/deepseek', () => ({
    chatStructuredCompletion: vi.fn(),
    chatCompletion: vi.fn(),
}));

import { chatStructuredCompletion } from '@/lib/ai/deepseek';

const mockChatStructured = vi.mocked(chatStructuredCompletion);

describe('quickCrisisKeywordCheck', () => {
    it('行为关键词 "割腕" 应返回true', () => {
        expect(quickCrisisKeywordCheck('我想割腕')).toBe(true);
    });

    it('行为关键词 "写遗书" 应返回true', () => {
        expect(quickCrisisKeywordCheck('我在写遗书')).toBe(true);
    });

    it('意念关键词 "不想活了" 应返回true', () => {
        expect(quickCrisisKeywordCheck('我不想活了')).toBe(true);
    });

    it('意念关键词 "去死" 应返回true', () => {
        expect(quickCrisisKeywordCheck('我想去死')).toBe(true);
    });

    it('正常文本 "今天工作很忙" 应返回false', () => {
        expect(quickCrisisKeywordCheck('今天工作很忙')).toBe(false);
    });

    it('正常文本 "今天真累死了" 应返回false', () => {
        // "累死了" 不在关键词列表中
        expect(quickCrisisKeywordCheck('今天真累死了')).toBe(false);
    });

    it('空字符串应返回false', () => {
        expect(quickCrisisKeywordCheck('')).toBe(false);
    });
});

describe('classifyCrisisIntent', () => {
    beforeEach(() => {
        mockChatStructured.mockReset();
    });

    it('首次调用成功应返回正确结果', async () => {
        mockChatStructured.mockResolvedValueOnce({
            crisis: true,
            confidence: 'high',
            reason: '用户表达了自杀意图',
        });

        const result = await classifyCrisisIntent('我不想活了');
        expect(result.isCrisis).toBe(true);
        expect(result.confidence).toBe('high');
        expect(result.reason).toBe('用户表达了自杀意图');
    });

    it('首次失败重试成功应返回重试结果', async () => {
        mockChatStructured
            .mockRejectedValueOnce(new Error('API timeout'))
            .mockResolvedValueOnce({
                crisis: false,
                confidence: 'medium',
                reason: '用户只是感到疲惫',
            });

        const result = await classifyCrisisIntent('今天好累');
        expect(result.isCrisis).toBe(false);
        expect(result.confidence).toBe('medium');
        expect(mockChatStructured).toHaveBeenCalledTimes(2);
    });

    it('两次都失败应返回兜底结果', async () => {
        mockChatStructured
            .mockRejectedValueOnce(new Error('API error'))
            .mockRejectedValueOnce(new Error('API error again'));

        const result = await classifyCrisisIntent('一些消息');
        expect(result.isCrisis).toBe(false);
        expect(result.confidence).toBe('low');
        expect(result.reason).toBeUndefined();
    });

    it('应正确映射字段 (crisis→isCrisis)', async () => {
        mockChatStructured.mockResolvedValueOnce({
            crisis: true,
            confidence: 'medium',
            reason: '用户提到了自残行为',
        });

        const result = await classifyCrisisIntent('我想伤害自己');
        expect(result).toEqual({
            isCrisis: true,
            confidence: 'medium',
            reason: '用户提到了自残行为',
        });
    });

    it('首次调用使用temperature 0.3，重试使用0.5', async () => {
        mockChatStructured
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValueOnce({
                crisis: false,
                confidence: 'low',
                reason: '无危机',
            });

        await classifyCrisisIntent('测试消息');

        // 第一次调用 temperature 0.3
        expect(mockChatStructured.mock.calls[0][2]).toMatchObject({ temperature: 0.3 });
        // 第二次调用 temperature 0.5
        expect(mockChatStructured.mock.calls[1][2]).toMatchObject({ temperature: 0.5 });
    });
});
