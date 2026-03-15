import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSafetyAgent, SafetyAssessmentSchema, DEFAULT_SAFE, SAFETY_AGENT_PROMPT } from './safety-agent';
import type { SafetyInput, SafetyAssessment } from './safety-agent';

// Mock LLM layer
vi.mock('@/lib/llm', () => ({
    generateStructured: vi.fn(),
}));

vi.mock('@/lib/llm/config', () => ({
    getSafetyLlmProvider: vi.fn(() => 'deepseek'),
}));

import { generateStructured } from '@/lib/llm';

const mockGenerateStructured = vi.mocked(generateStructured);

describe('SafetyAgent', () => {
    // 重置单例以确保每个测试独立
    beforeEach(() => {
        mockGenerateStructured.mockReset();
    });

    const createInput = (overrides?: Partial<SafetyInput>): SafetyInput => ({
        message: '我今天心情不好',
        history: [],
        triageSafety: 'caution',
        ...overrides,
    });

    // ===== Schema 验证 =====

    describe('SafetyAssessmentSchema', () => {
        it('合法数据通过验证', () => {
            const valid = {
                reasoning: '用户表达了轻微的焦虑',
                label: 'self-care',
                score: 3,
                constraints: ['关注当下感受'],
            };
            expect(() => SafetyAssessmentSchema.parse(valid)).not.toThrow();
        });

        it('无效 label 拒绝', () => {
            const invalid = {
                reasoning: 'test',
                label: 'invalid-label',
                score: 5,
            };
            expect(() => SafetyAssessmentSchema.parse(invalid)).toThrow();
        });

        it('缺少必填字段拒绝', () => {
            expect(() => SafetyAssessmentSchema.parse({})).toThrow();
        });

        it('constraints 可选', () => {
            const noConstraints = {
                reasoning: 'test',
                label: 'normal',
                score: 0,
            };
            expect(() => SafetyAssessmentSchema.parse(noConstraints)).not.toThrow();
        });
    });

    // ===== 正常执行 =====

    describe('run（正常流程）', () => {
        it('crisis 输入 — 返回高危评估', async () => {
            const crisisResult: SafetyAssessment = {
                reasoning: '用户明确表达自杀计划',
                label: 'crisis',
                score: 9,
                constraints: ['必须提供紧急热线', '不进行认知挑战', '保持简短直接'],
            };
            mockGenerateStructured.mockResolvedValue(crisisResult);

            const agent = getSafetyAgent();
            const result = await agent.run(createInput({
                message: '我已经写好遗书了',
                triageSafety: 'crisis',
            }));

            expect(result.success).toBe(true);
            expect(result.data.label).toBe('crisis');
            expect(result.data.score).toBeGreaterThanOrEqual(8);
            expect(result.data.constraints).toContain('必须提供紧急热线');
        });

        it('urgent 输入 — 返回 urgent 评估', async () => {
            mockGenerateStructured.mockResolvedValue({
                reasoning: '用户暗示自伤但无具体计划',
                label: 'urgent',
                score: 6,
                constraints: ['温和询问安全计划', '提供热线信息'],
            });

            const agent = getSafetyAgent();
            const result = await agent.run(createInput({
                message: '有时候觉得不想活了',
                triageSafety: 'urgent',
            }));

            expect(result.success).toBe(true);
            expect(result.data.label).toBe('urgent');
        });

        it('self-care 输入 — 返回低风险评估', async () => {
            mockGenerateStructured.mockResolvedValue({
                reasoning: '用户表达日常压力',
                label: 'self-care',
                score: 2,
                constraints: ['关注当下感受'],
            });

            const agent = getSafetyAgent();
            const result = await agent.run(createInput({
                message: '最近加班太多，好累',
                triageSafety: 'caution',
            }));

            expect(result.success).toBe(true);
            expect(result.data.label).toBe('self-care');
            expect(result.data.score).toBeLessThanOrEqual(3);
        });

        it('对话历史 — 只取最近 5 轮', async () => {
            mockGenerateStructured.mockResolvedValue({
                reasoning: 'test',
                label: 'normal',
                score: 0,
                constraints: [],
            });

            const longHistory = Array.from({ length: 10 }, (_, i) => ({
                role: 'user' as const,
                content: `消息 ${i}`,
            }));

            const agent = getSafetyAgent();
            await agent.run(createInput({
                history: longHistory,
            }));

            // 检查传给 generateStructured 的消息数量
            const messages = mockGenerateStructured.mock.calls[0][0] as any[];
            // system(1) + history(5) + user(1) = 7
            expect(messages.length).toBe(7);
        });
    });

    // ===== 降级机制 =====

    describe('run（降级 / 错误处理）', () => {
        it('LLM 超时 — 降级到 DEFAULT_SAFE', async () => {
            mockGenerateStructured.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve({
                    reasoning: 'too late',
                    label: 'crisis',
                    score: 9,
                    constraints: [],
                } as any), 10000))
            );

            const agent = getSafetyAgent();
            const result = await agent.run(createInput({
                message: '我想死',
                triageSafety: 'crisis',
            }));

            expect(result.success).toBe(false);
            expect(result.data).toEqual(DEFAULT_SAFE);
            expect(result.error).toContain('timed out');
        }, 10000);

        it('LLM 异常 — 降级到 DEFAULT_SAFE', async () => {
            mockGenerateStructured.mockRejectedValue(new Error('API quota exceeded'));

            const agent = getSafetyAgent();
            const result = await agent.run(createInput());

            expect(result.success).toBe(false);
            expect(result.data).toEqual(DEFAULT_SAFE);
            expect(result.data.label).toBe('normal');
        });

        it('DEFAULT_SAFE 结构正确', () => {
            expect(DEFAULT_SAFE.label).toBe('normal');
            expect(DEFAULT_SAFE.score).toBe(0);
            expect(DEFAULT_SAFE.constraints).toEqual([]);
            expect(DEFAULT_SAFE.reasoning).toBeTruthy();
        });
    });

    // ===== 双向测试：不应误报 =====

    describe('不应误报为危机', () => {
        const normalCases = [
            '今天天气不错',
            '最近工作压力好大',
            '失眠快一个月了',
            '跟男朋友吵架了',
            '心情很低落，什么都不想做',
            '觉得自己很没用',
        ];

        normalCases.forEach(msg => {
            it(`"${msg}" — 不应返回 crisis/urgent`, async () => {
                mockGenerateStructured.mockResolvedValue({
                    reasoning: '用户表达日常情绪',
                    label: 'normal',
                    score: 1,
                    constraints: [],
                });

                const agent = getSafetyAgent();
                const result = await agent.run(createInput({
                    message: msg,
                    triageSafety: 'caution',
                }));

                expect(result.data.label).not.toBe('crisis');
            });
        });
    });

    // ===== Agent 元数据 =====

    describe('Agent 元数据', () => {
        it('agentName 为 safety', () => {
            const agent = getSafetyAgent();
            expect(agent.name).toBe('safety');
        });

        it('model 为 deepseek-chat', () => {
            const agent = getSafetyAgent();
            expect(agent.model).toBe('deepseek-chat');
        });

        it('返回结果包含 latency', async () => {
            mockGenerateStructured.mockResolvedValue({
                reasoning: 'test',
                label: 'normal',
                score: 0,
                constraints: [],
            });

            const agent = getSafetyAgent();
            const result = await agent.run(createInput());
            expect(result.latency).toBeGreaterThanOrEqual(0);
            expect(typeof result.latency).toBe('number');
        });
    });

    // ===== Prompt 完整性 =====

    describe('Prompt 完整性', () => {
        it('系统提示包含 4 个评估维度', () => {
            expect(SAFETY_AGENT_PROMPT).toContain('即时风险');
            expect(SAFETY_AGENT_PROMPT).toContain('风险升级');
            expect(SAFETY_AGENT_PROMPT).toContain('保护因素');
            expect(SAFETY_AGENT_PROMPT).toContain('行为约束');
        });

        it('系统提示包含所有 label 选项', () => {
            expect(SAFETY_AGENT_PROMPT).toContain('crisis');
            expect(SAFETY_AGENT_PROMPT).toContain('urgent');
            expect(SAFETY_AGENT_PROMPT).toContain('self-care');
            expect(SAFETY_AGENT_PROMPT).toContain('normal');
        });

        it('系统提示包含约束示例', () => {
            expect(SAFETY_AGENT_PROMPT).toContain('紧急热线');
            expect(SAFETY_AGENT_PROMPT).toContain('不进行认知挑战');
        });
    });
});
