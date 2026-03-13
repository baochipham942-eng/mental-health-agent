import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quickCrisisCheck, classifyCrisisIntent } from './crisis-classifier';

vi.mock('@/lib/ai/deepseek', () => ({
    chatStructuredCompletion: vi.fn(),
    chatCompletion: vi.fn(),
}));

vi.mock('ai', () => ({
    generateText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
    createOpenAI: vi.fn(() => (model: string) => model),
}));

import { chatStructuredCompletion } from '@/lib/ai/deepseek';
import { generateText } from 'ai';

const mockChatStructured = vi.mocked(chatStructuredCompletion);
const mockGenerateText = vi.mocked(generateText);

describe('quickCrisisCheck (few-shot)', () => {
    beforeEach(() => {
        mockGenerateText.mockReset();
        vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    });

    it('模型返回 YES 时应返回 true', async () => {
        mockGenerateText.mockResolvedValueOnce({ text: 'YES' } as any);
        expect(await quickCrisisCheck('我不想活了')).toBe(true);
    });

    it('模型返回 NO 时应返回 false', async () => {
        mockGenerateText.mockResolvedValueOnce({ text: 'NO' } as any);
        expect(await quickCrisisCheck('今天工作很忙')).toBe(false);
    });

    it('模型超时应返回 false', async () => {
        mockGenerateText.mockImplementationOnce(() =>
            new Promise((resolve) => setTimeout(() => resolve({ text: 'YES' } as any), 5000))
        );
        expect(await quickCrisisCheck('一些消息', 10)).toBe(false);
    });

    it('模型异常应返回 false', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('API error'));
        expect(await quickCrisisCheck('一些消息')).toBe(false);
    });

    it('无 DEEPSEEK_API_KEY 应返回 false', async () => {
        vi.stubEnv('DEEPSEEK_API_KEY', '');
        expect(await quickCrisisCheck('我想死')).toBe(false);
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
});
