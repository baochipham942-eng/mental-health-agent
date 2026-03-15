import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeEmotion } from './emotion';

// Mock deepseek
vi.mock('./deepseek', () => ({
    analyzeEmotion: vi.fn(),
}));

import { analyzeEmotion as deepseekAnalyzeEmotion } from './deepseek';

const mockDeepseekEmotion = vi.mocked(deepseekAnalyzeEmotion);

describe('analyzeEmotion', () => {
    beforeEach(() => {
        mockDeepseekEmotion.mockReset();
    });

    // ===== 7 种情绪分类 =====

    describe('情绪分类', () => {
        const emotionCases: Array<{ input: string; label: string; scoreRange: [number, number] }> = [
            { input: '我好焦虑，明天要考试', label: '焦虑', scoreRange: [5, 10] },
            { input: '什么都不想做，活着没意思', label: '抑郁', scoreRange: [6, 10] },
            { input: '被老板骂了一顿，气死了', label: '愤怒', scoreRange: [5, 10] },
            { input: '爷爷走了，我好想他', label: '悲伤', scoreRange: [5, 10] },
            { input: '晚上一个人走夜路好害怕', label: '恐惧', scoreRange: [4, 10] },
            { input: '今天升职了，太开心了！', label: '快乐', scoreRange: [7, 10] },
            { input: '今天在家看书，很安静', label: '平静', scoreRange: [3, 7] },
        ];

        emotionCases.forEach(({ input, label, scoreRange }) => {
            it(`"${input}" → ${label}`, async () => {
                mockDeepseekEmotion.mockResolvedValue({
                    label: label as any,
                    score: scoreRange[0],
                });

                const result = await analyzeEmotion(input);
                expect(result).not.toBeNull();
                expect(result!.label).toBe(label);
                expect(result!.score).toBeGreaterThanOrEqual(scoreRange[0]);
                expect(result!.score).toBeLessThanOrEqual(scoreRange[1]);
            });
        });
    });

    // ===== 强度范围 =====

    describe('强度范围', () => {
        it('score 在 0-10 范围内', async () => {
            mockDeepseekEmotion.mockResolvedValue({ label: '焦虑', score: 7 });
            const result = await analyzeEmotion('我很紧张');
            expect(result!.score).toBeGreaterThanOrEqual(0);
            expect(result!.score).toBeLessThanOrEqual(10);
        });

        it('返回 confidence 字段（可选）', async () => {
            mockDeepseekEmotion.mockResolvedValue({ label: '快乐', score: 8, confidence: 0.9 });
            const result = await analyzeEmotion('太棒了');
            expect(result!.confidence).toBe(0.9);
        });
    });

    // ===== 边界情况 =====

    describe('边界情况', () => {
        it('空字符串 → 返回 null', async () => {
            const result = await analyzeEmotion('');
            expect(result).toBeNull();
            expect(mockDeepseekEmotion).not.toHaveBeenCalled();
        });

        it('纯空格 → 返回 null', async () => {
            const result = await analyzeEmotion('   ');
            expect(result).toBeNull();
            expect(mockDeepseekEmotion).not.toHaveBeenCalled();
        });

        it('正常文本 → 调用 deepseek', async () => {
            mockDeepseekEmotion.mockResolvedValue({ label: '平静', score: 3 });
            await analyzeEmotion('今天天气不错');
            expect(mockDeepseekEmotion).toHaveBeenCalledWith('今天天气不错', expect.any(Object));
        });

        it('传递 traceMetadata', async () => {
            mockDeepseekEmotion.mockResolvedValue({ label: '平静', score: 3 });
            const metadata = { sessionId: 'test-123' };
            await analyzeEmotion('你好', metadata);
            expect(mockDeepseekEmotion).toHaveBeenCalledWith('你好', { traceMetadata: metadata });
        });
    });

    // ===== LLM 异常 =====

    describe('LLM 异常', () => {
        it('API 错误 → 向上抛出', async () => {
            mockDeepseekEmotion.mockRejectedValue(new Error('API error'));
            await expect(analyzeEmotion('测试')).rejects.toThrow('API error');
        });

        it('返回 null（API 未配置）→ 返回 null', async () => {
            mockDeepseekEmotion.mockResolvedValue(null);
            const result = await analyzeEmotion('测试');
            expect(result).toBeNull();
        });
    });
});
