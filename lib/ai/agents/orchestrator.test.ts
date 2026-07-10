import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orchestrate, triggerQualityCheck } from './orchestrator';
import type { OrchestrationInput } from './orchestrator';

// Mock 依赖
vi.mock('./triage-agent', () => ({
    getTriageAgent: vi.fn(),
    runTriageWithFallback: vi.fn(),
}));

vi.mock('./safety-agent', () => ({
    getSafetyAgent: vi.fn(() => ({
        run: vi.fn(),
        name: 'safety',
        model: 'deepseek-v4-flash',
    })),
    DEFAULT_SAFE: {
        reasoning: 'Safety check skipped (normal)',
        label: 'normal',
        score: 0,
        constraints: [],
    },
}));

vi.mock('./base-agent', () => ({
    runAgentConditional: vi.fn(),
}));

vi.mock('./quality-agent', () => ({
    runQualityCheckAsync: vi.fn(),
}));

import { runTriageWithFallback } from './triage-agent';
import { runAgentConditional } from './base-agent';
import { runQualityCheckAsync } from './quality-agent';
import { DEFAULT_SAFE } from './safety-agent';

const mockRunTriage = vi.mocked(runTriageWithFallback);
const mockRunConditional = vi.mocked(runAgentConditional);
const mockQualityAsync = vi.mocked(runQualityCheckAsync);

function createInput(overrides?: Partial<OrchestrationInput>): OrchestrationInput {
    return {
        message: '今天心情不好',
        history: [],
        recentHistory: [],
        ...overrides,
    };
}

function createTriageResult(overrides?: Record<string, any>) {
    return {
        success: true,
        data: {
            safety: 'normal',
            safetyReasoning: '无风险',
            stateReasoning: '用户表达情绪',
            emotion: { label: '情绪低落', score: 6 },
            route: 'support',
            needsValidation: false,
            adaptiveMode: 'companion',
            personaReasoning: '陪伴模式',
            memoryCheck: '无',
            ...overrides,
        },
        latency: 200,
        agentName: 'triage',
        model: 'llama-3.1-8b-instant',
    };
}

function createSafetyResult(overrides?: Record<string, any>) {
    return {
        success: true,
        data: {
            reasoning: 'test',
            label: 'normal',
            score: 0,
            constraints: [],
            ...overrides,
        },
        latency: 0,
        agentName: 'safety',
        model: 'deepseek-v4-flash',
    };
}

describe('orchestrate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ===== 正常流程 =====

    describe('正常流程', () => {
        it('normal 消息 → triage + safety(skip)', async () => {
            mockRunTriage.mockResolvedValue(createTriageResult() as any);
            mockRunConditional.mockResolvedValue(createSafetyResult() as any);

            const result = await orchestrate(createInput());

            expect(result.triage.data.route).toBe('support');
            expect(result.safety.data.label).toBe('normal');
            // safety 不应被触发（condition=false）
            expect(mockRunConditional).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                false, // needsSafetyCheck = false
            );
        });

        it('urgent 消息 → triage + safety(执行)', async () => {
            mockRunTriage.mockResolvedValue(createTriageResult({ safety: 'urgent' }) as any);
            mockRunConditional.mockResolvedValue(createSafetyResult({ label: 'urgent', score: 6 }) as any);

            const result = await orchestrate(createInput({ message: '有时候觉得活着没意思' }));

            expect(result.triage.data.safety).toBe('urgent');
            // safety 应被触发（condition=true）
            expect(mockRunConditional).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ message: '有时候觉得活着没意思', triageSafety: 'urgent' }),
                true,
            );
        });

        it('crisis 消息 → triage + safety(执行)', async () => {
            mockRunTriage.mockResolvedValue(createTriageResult({ safety: 'crisis', route: 'crisis' }) as any);
            mockRunConditional.mockResolvedValue(createSafetyResult({ label: 'crisis', score: 9 }) as any);

            const result = await orchestrate(createInput({ message: '我想死' }));

            expect(result.triage.data.route).toBe('crisis');
            expect(mockRunConditional).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                true,
            );
        });
    });

    // ===== 返回结构 =====

    describe('返回结构', () => {
        it('返回 triage 和 safety 两个 AgentResult', async () => {
            mockRunTriage.mockResolvedValue(createTriageResult() as any);
            mockRunConditional.mockResolvedValue(createSafetyResult() as any);

            const result = await orchestrate(createInput());

            expect(result).toHaveProperty('triage');
            expect(result).toHaveProperty('safety');
            expect(result.triage).toHaveProperty('success');
            expect(result.triage).toHaveProperty('data');
            expect(result.triage).toHaveProperty('latency');
            expect(result.safety).toHaveProperty('data');
        });
    });

    // ===== Triage 输入传递 =====

    describe('输入传递', () => {
        it('message 和 recentHistory 传递给 triage', async () => {
            mockRunTriage.mockResolvedValue(createTriageResult() as any);
            mockRunConditional.mockResolvedValue(createSafetyResult() as any);

            const recentHistory = [{ role: 'user', content: '之前的消息' }];
            await orchestrate(createInput({ message: '新消息', recentHistory }));

            expect(mockRunTriage).toHaveBeenCalledWith({
                message: '新消息',
                recentHistory,
            });
        });

        it('message 和 history 传递给 safety', async () => {
            const history = [{ role: 'user' as const, content: '历史消息' }] as any;
            mockRunTriage.mockResolvedValue(createTriageResult({ safety: 'urgent' }) as any);
            mockRunConditional.mockResolvedValue(createSafetyResult() as any);

            await orchestrate(createInput({ message: '新消息', history }));

            expect(mockRunConditional).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    message: '新消息',
                    history,
                    triageSafety: 'urgent',
                }),
                true,
            );
        });
    });

    // ===== 降级 =====

    describe('降级', () => {
        it('triage 失败 → safety 仍使用 triage 降级数据', async () => {
            mockRunTriage.mockResolvedValue({
                success: false,
                data: { safety: 'normal', route: 'support', emotion: { label: '平静', score: 5 } },
                latency: 2000,
                agentName: 'triage',
                model: 'llama-3.1-8b-instant',
                error: 'timeout',
            } as any);
            mockRunConditional.mockResolvedValue(createSafetyResult() as any);

            const result = await orchestrate(createInput());

            // triage 失败但返回了保守默认值，orchestrate 仍正常
            expect(result.triage.success).toBe(false);
            expect(result.triage.data.safety).toBe('normal');
        });
    });
});

describe('triggerQualityCheck', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('调用 runQualityCheckAsync', () => {
        const input = {
            reply: '测试回复',
            userMessage: '测试消息',
            routeType: 'support',
            adaptiveMode: 'companion',
            safetyLevel: 'normal',
        };
        triggerQualityCheck(input);
        expect(mockQualityAsync).toHaveBeenCalledWith(input);
    });
});
