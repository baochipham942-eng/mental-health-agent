import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quickCrisisCheck, quickCrisisKeywordCheck, classifyCrisisIntent } from './crisis-classifier';

vi.mock('@/lib/ai/deepseek', () => ({
    chatStructuredCompletion: vi.fn(),
    chatCompletion: vi.fn(),
    deepseek: vi.fn(() => (model: string) => model),
}));

vi.mock('ai', () => ({
    generateText: vi.fn(),
}));

import { chatStructuredCompletion } from '@/lib/ai/deepseek';
import { generateText } from 'ai';

const mockChatStructured = vi.mocked(chatStructuredCompletion);
const mockGenerateText = vi.mocked(generateText);

// ====== 关键词兜底覆盖率 ======

describe('crisisKeywordFallback — 关键词兜底覆盖', () => {
    // 使用 quickCrisisKeywordCheck（内部调用 crisisKeywordFallback）来测试关键词匹配
    // 不需要 mock，纯同步函数

    describe('应识别的危机意图表达', () => {
        const crisisMessages = [
            // 自杀意图
            { msg: '我不想活了', keyword: '不想活' },
            { msg: '真的想死', keyword: '想死' },
            { msg: '你去死吧…算了我自己去死', keyword: '去死' },
            { msg: '我要自杀', keyword: '自杀' },
            // 自伤
            { msg: '想自残来释放压力', keyword: '自残' },
            { msg: '有自伤的冲动', keyword: '自伤' },
            // 具体行为
            { msg: '我想割腕', keyword: '割腕' },
            { msg: '站在天台想跳楼', keyword: '跳楼' },
            { msg: '去河边想跳河', keyword: '跳河' },
            { msg: '买了绳子想上吊', keyword: '上吊' },
            { msg: '准备烧炭了', keyword: '烧炭' },
            { msg: '买了安眠药准备服毒', keyword: '服毒' },
            { msg: '吃了一把药吞药了', keyword: '吞药' },
            // 计划/告别
            { msg: '我已经写好遗书了', keyword: '遗书' },
            { msg: '活着真没意思不如一了百了', keyword: '一了百了' },
            { msg: '不如死了算了', keyword: '不如死' },
            { msg: '想结束生命', keyword: '结束生命' },
            { msg: '想了结自己', keyword: '了结' },
            // 委婉表达
            { msg: '好想永远睡过去不再醒来', keyword: '永远睡' },
            { msg: '这个世界没有我会更好', keyword: '没有我会更好' },
            { msg: '觉得活着没意义', keyword: '活着没意义' },
            { msg: '觉得活着没有意义', keyword: '活着没有意义' },
        ];

        it.each(crisisMessages)('「$msg」应命中关键词「$keyword」', ({ msg }) => {
            expect(quickCrisisKeywordCheck(msg)).toBe(true);
        });
    });

    describe('不应误判的普通负面情绪', () => {
        const safeMessages = [
            '最近工作压力好大',
            '今天真的累死了',
            '最近状态越来越差了',
            '被领导骂了好生气',
            '失眠快一个月了，什么都提不起劲',
            '心情很低落，什么都不想做',
            '跟男朋友吵架了想分手',
            '觉得自己很没用',
            '好绝望啊',
            '焦虑得睡不着觉',
            '感觉人生好迷茫',
            '什么都做不好，好挫败',
        ];

        it.each(safeMessages)('「%s」不应触发危机', (msg) => {
            expect(quickCrisisKeywordCheck(msg)).toBe(false);
        });
    });
});

// ====== quickCrisisCheck — LLM 主路径 + 兜底 ======

describe('quickCrisisCheck (few-shot)', () => {
    beforeEach(() => {
        mockGenerateText.mockReset();
        vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    });

    // --- LLM 正常返回 ---

    it('模型返回 YES 时应返回 true', async () => {
        mockGenerateText.mockResolvedValueOnce({ text: 'YES' } as any);
        expect(await quickCrisisCheck('我不想活了')).toBe(true);
    });

    it('模型返回 NO 时应返回 false', async () => {
        mockGenerateText.mockResolvedValueOnce({ text: 'NO' } as any);
        expect(await quickCrisisCheck('今天工作很忙')).toBe(false);
    });

    it('模型返回 YES（带空格/换行）也应识别', async () => {
        mockGenerateText.mockResolvedValueOnce({ text: '  YES\n' } as any);
        expect(await quickCrisisCheck('想死')).toBe(true);
    });

    it('模型返回 NO 但消息含危机关键词，以模型结果为准', async () => {
        // LLM 判断优先——模型说 NO 就信 NO（可能是语境理解后判定非真实意图）
        mockGenerateText.mockResolvedValueOnce({ text: 'NO' } as any);
        expect(await quickCrisisCheck('我不想活了')).toBe(false);
    });

    // --- LLM 超时 → 关键词兜底 ---

    it('模型超时 + 非危机消息 → 关键词兜底返回 false', async () => {
        mockGenerateText.mockImplementationOnce(() =>
            new Promise((resolve) => setTimeout(() => resolve({ text: 'YES' } as any), 5000))
        );
        expect(await quickCrisisCheck('一些消息', 10)).toBe(false);
    });

    it('模型超时 + 危机消息「不想活了」→ 关键词兜底返回 true', async () => {
        mockGenerateText.mockImplementationOnce(() =>
            new Promise((resolve) => setTimeout(() => resolve({ text: 'YES' } as any), 5000))
        );
        expect(await quickCrisisCheck('我不想活了', 10)).toBe(true);
    });

    it('模型超时 + 危机消息「活着没有意义」→ 关键词兜底返回 true', async () => {
        mockGenerateText.mockImplementationOnce(() =>
            new Promise((resolve) => setTimeout(() => resolve({ text: 'YES' } as any), 5000))
        );
        expect(await quickCrisisCheck('觉得活着没有意义', 10)).toBe(true);
    });

    it('模型超时 + 危机消息「割腕」→ 关键词兜底返回 true', async () => {
        mockGenerateText.mockImplementationOnce(() =>
            new Promise((resolve) => setTimeout(() => resolve({ text: 'YES' } as any), 5000))
        );
        expect(await quickCrisisCheck('我想割腕', 10)).toBe(true);
    });

    // --- LLM 异常 → 关键词兜底 ---

    it('模型异常 + 非危机消息 → 关键词兜底返回 false', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('API error'));
        expect(await quickCrisisCheck('一些消息')).toBe(false);
    });

    it('模型异常 + 危机消息 → 关键词兜底返回 true', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('API error'));
        expect(await quickCrisisCheck('我想死')).toBe(true);
    });

    it('模型异常 + 委婉危机表达「一了百了」→ 兜底返回 true', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('network timeout'));
        expect(await quickCrisisCheck('活着真没意思不如一了百了')).toBe(true);
    });

    // --- 无 API Key → 关键词兜底 ---

    it('无 DEEPSEEK_API_KEY + 危机消息 → 关键词兜底返回 true', async () => {
        vi.stubEnv('DEEPSEEK_API_KEY', '');
        expect(await quickCrisisCheck('我想死')).toBe(true);
    });

    it('无 DEEPSEEK_API_KEY + 非危机消息 → 关键词兜底返回 false', async () => {
        vi.stubEnv('DEEPSEEK_API_KEY', '');
        expect(await quickCrisisCheck('今天好累')).toBe(false);
    });

    // --- P0-5 E2E 复现场景 ---

    it('P0-5 复现：超时 + 「我不想活了，觉得活着没有意义」→ 必须返回 true', async () => {
        mockGenerateText.mockImplementationOnce(() =>
            new Promise((resolve) => setTimeout(() => resolve({ text: 'YES' } as any), 5000))
        );
        expect(await quickCrisisCheck('我不想活了，觉得活着没有意义', 10)).toBe(true);
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
