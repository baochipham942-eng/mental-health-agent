import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTriageAgent, runTriageWithFallback, WEAK_TRIAGE_PROMPT } from './triage-agent';
import type { TriageInput } from './triage-agent';

// Mock 依赖
vi.mock('ai', () => ({
    generateText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
    createOpenAI: vi.fn(() => (model: string) => model),
}));

vi.mock('./fast-model', () => ({
    getFastAgentConfig: vi.fn(() => ({
        provider: (model: string) => model,
        providerName: 'groq',
        model: 'llama-3.1-8b-instant',
    })),
}));

vi.mock('../crisis-classifier', () => ({
    quickCrisisCheck: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../middleware/safety-guard', () => ({
    runHeuristicSafetyCheck: vi.fn(() => ({ isDowngraded: false })),
}));

vi.mock('../deepseek', () => ({
    chatStructuredCompletion: vi.fn(),
}));

import { generateText } from 'ai';
import { quickCrisisCheck } from '../crisis-classifier';
import { runHeuristicSafetyCheck } from '../../middleware/safety-guard';

const mockGenerateText = vi.mocked(generateText);
const mockQuickCrisis = vi.mocked(quickCrisisCheck);
const mockSafetyGuard = vi.mocked(runHeuristicSafetyCheck);

function createInput(overrides?: Partial<TriageInput>): TriageInput {
    return {
        message: '今天心情不好',
        recentHistory: [],
        ...overrides,
    };
}

function mockTriageResponse(data: Record<string, any>) {
    mockGenerateText.mockResolvedValueOnce({
        text: JSON.stringify({
            safety: 'normal',
            safetyReasoning: '无风险',
            stateReasoning: '用户表达情绪',
            emotion: { label: '情绪低落', score: 6 },
            route: 'support',
            needsValidation: false,
            adaptiveMode: 'companion',
            personaReasoning: '陪伴模式',
            memoryCheck: '无',
            ...data,
        }),
    } as any);
}

describe('TriageAgent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ===== 路由准确性 =====

    describe('路由分类', () => {
        it('日常倾诉 → support', async () => {
            mockTriageResponse({ route: 'support', safety: 'normal' });
            const agent = getTriageAgent();
            const result = await agent.run(createInput({ message: '今天工作好累' }));
            expect(result.success).toBe(true);
            expect(result.data.route).toBe('support');
        });

        it('评估请求 → assessment', async () => {
            mockTriageResponse({ route: 'assessment', safety: 'normal' });
            const agent = getTriageAgent();
            const result = await agent.run(createInput({ message: '我想测一下自己的状态' }));
            expect(result.data.route).toBe('assessment');
        });

        it('危机信号 → crisis', async () => {
            mockTriageResponse({ route: 'crisis', safety: 'crisis' });
            const agent = getTriageAgent();
            const result = await agent.run(createInput({ message: '我想结束这一切' }));
            expect(result.data.route).toBe('crisis');
            expect(result.data.safety).toBe('crisis');
        });

        it('打招呼 → support', async () => {
            mockTriageResponse({ route: 'support', safety: 'normal', emotion: { label: '未表达', score: 0 } });
            const agent = getTriageAgent();
            const result = await agent.run(createInput({ message: '你好' }));
            expect(result.data.route).toBe('support');
        });

        it('练习请求 → support', async () => {
            mockTriageResponse({ route: 'support', safety: 'normal' });
            const agent = getTriageAgent();
            const result = await agent.run(createInput({ message: '帮我做个呼吸练习' }));
            expect(result.data.route).toBe('support');
        });
    });

    // ===== 情绪识别 =====

    describe('情绪识别', () => {
        it('返回 emotion 包含 label 和 score', async () => {
            mockTriageResponse({ emotion: { label: '焦虑', score: 7 } });
            const agent = getTriageAgent();
            const result = await agent.run(createInput());
            expect(result.data.emotion).toEqual({ label: '焦虑', score: 7 });
        });

        it('无明显情绪 → 未表达 + score 0', async () => {
            mockTriageResponse({ emotion: { label: '未表达', score: 0 } });
            const agent = getTriageAgent();
            const result = await agent.run(createInput({ message: '今天天气不错' }));
            expect(result.data.emotion.label).toBe('未表达');
            expect(result.data.emotion.score).toBe(0);
        });
    });

    // ===== 安全判断 =====

    describe('安全等级', () => {
        it('crisis — 最高优先级', async () => {
            mockTriageResponse({ safety: 'crisis', route: 'crisis' });
            const agent = getTriageAgent();
            const result = await agent.run(createInput({ message: '我已经写好遗书了' }));
            expect(result.data.safety).toBe('crisis');
        });

        it('urgent — 有暗示但无具体计划', async () => {
            mockTriageResponse({ safety: 'urgent' });
            const agent = getTriageAgent();
            const result = await agent.run(createInput({ message: '有时候觉得活着没意思' }));
            expect(result.data.safety).toBe('urgent');
        });

        it('启发式安全守卫降级 — 误报纠正', async () => {
            mockTriageResponse({ safety: 'crisis', route: 'crisis' });
            mockSafetyGuard.mockReturnValueOnce({ isDowngraded: true, reason: '不含真实危机信号' } as any);

            const agent = getTriageAgent();
            const result = await agent.run(createInput({ message: '今天累死了' }));

            // 被降级后应为 normal + support
            expect(result.data.safety).toBe('normal');
            expect(result.data.route).toBe('support');
        });
    });

    // ===== 对话历史注入 =====

    describe('对话历史', () => {
        it('有历史 → 注入到 system prompt', async () => {
            mockTriageResponse({});
            const agent = getTriageAgent();
            await agent.run(createInput({
                recentHistory: [
                    { role: 'user', content: '我最近很焦虑' },
                    { role: 'assistant', content: '能说说是什么让你感到焦虑吗？' },
                ],
            }));

            const messages = (mockGenerateText.mock.calls[0][0] as any).messages;
            const systemMsg = messages.find((m: any) => m.role === 'system');
            expect(systemMsg.content).toContain('最近对话上下文');
            expect(systemMsg.content).toContain('我最近很焦虑');
        });

        it('无历史 → 不注入上下文', async () => {
            mockTriageResponse({});
            const agent = getTriageAgent();
            await agent.run(createInput({ recentHistory: [] }));

            const messages = (mockGenerateText.mock.calls[0][0] as any).messages;
            const systemMsg = messages.find((m: any) => m.role === 'system');
            expect(systemMsg.content).not.toContain('最近对话上下文');
        });
    });

    // ===== 降级机制 =====

    describe('降级', () => {
        it('LLM 超时 → 返回保守默认值', async () => {
            mockGenerateText.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve({ text: '{}' } as any), 5000))
            );

            const agent = getTriageAgent();
            const result = await agent.run(createInput());

            expect(result.success).toBe(false);
            expect(result.data.safety).toBe('normal');
            expect(result.data.route).toBe('support');
        });

        it('LLM 返回无效 JSON → 降级', async () => {
            mockGenerateText.mockResolvedValueOnce({ text: 'not json at all' } as any);
            const agent = getTriageAgent();
            const result = await agent.run(createInput());
            expect(result.success).toBe(false);
        });

        it('LLM 返回缺少必填字段 → 用默认值', async () => {
            mockGenerateText.mockResolvedValueOnce({
                text: JSON.stringify({ safety: 'normal' }), // 缺 emotion 和 route
            } as any);
            const agent = getTriageAgent();
            const result = await agent.run(createInput());
            // 缺少字段时返回 DEFAULT_TRIAGE
            expect(result.data.emotion).toBeDefined();
            expect(result.data.route).toBeDefined();
        });

        it('Provider 未配置 → 返回默认值', async () => {
            const { getFastAgentConfig } = await import('./fast-model');
            vi.mocked(getFastAgentConfig).mockReturnValueOnce({
                provider: null,
                providerName: 'groq',
                model: 'llama-3.1-8b-instant',
            } as any);

            const agent = getTriageAgent();
            const result = await agent.run(createInput());
            expect(result.data.route).toBe('support');
            expect(result.data.safety).toBe('normal');
        });
    });

    // ===== runTriageWithFallback =====

    describe('runTriageWithFallback', () => {
        it('主流程成功 → 直接返回', async () => {
            mockTriageResponse({ route: 'support', safety: 'normal' });
            const result = await runTriageWithFallback(createInput());
            expect(result.success).toBe(true);
            expect(result.data.route).toBe('support');
        });

        it('主流程失败 + quickCrisisCheck 命中 → 返回 crisis', async () => {
            mockGenerateText.mockRejectedValueOnce(new Error('Groq down'));
            mockQuickCrisis.mockResolvedValueOnce(true);

            const result = await runTriageWithFallback(createInput({ message: '我想死' }));
            expect(result.data.safety).toBe('crisis');
            expect(result.data.route).toBe('crisis');
        });

        it('主流程失败 + quickCrisisCheck 未命中 → 保守默认', async () => {
            mockGenerateText.mockRejectedValueOnce(new Error('Groq down'));
            mockQuickCrisis.mockResolvedValueOnce(false);

            const result = await runTriageWithFallback(createInput({ message: '今天好累' }));
            expect(result.data.safety).toBe('normal');
            expect(result.data.route).toBe('support');
        });
    });

    // ===== Prompt 完整性 =====

    describe('Prompt 完整性', () => {
        it('包含所有 safety 等级', () => {
            expect(WEAK_TRIAGE_PROMPT).toContain('"crisis"');
            expect(WEAK_TRIAGE_PROMPT).toContain('"urgent"');
            expect(WEAK_TRIAGE_PROMPT).toContain('"normal"');
        });

        it('包含所有 route 类型', () => {
            expect(WEAK_TRIAGE_PROMPT).toContain('"support"');
            expect(WEAK_TRIAGE_PROMPT).toContain('"assessment"');
        });

        it('包含所有 adaptiveMode', () => {
            expect(WEAK_TRIAGE_PROMPT).toContain('"guardian"');
            expect(WEAK_TRIAGE_PROMPT).toContain('"companion"');
            expect(WEAK_TRIAGE_PROMPT).toContain('"guide"');
            expect(WEAK_TRIAGE_PROMPT).toContain('"coach"');
        });

        it('强调保守原则', () => {
            expect(WEAK_TRIAGE_PROMPT).toContain('保守');
        });
    });

    // ===== Agent 元数据 =====

    describe('元数据', () => {
        it('name 为 triage', () => {
            expect(getTriageAgent().name).toBe('triage');
        });

        it('latency 有值', async () => {
            mockTriageResponse({});
            const result = await getTriageAgent().run(createInput());
            expect(result.latency).toBeGreaterThanOrEqual(0);
        });
    });
});
