import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCounselorAgent } from './counselor-agent';
import type { CounselorInput } from './counselor-agent';
import { DEEPSEEK_MODEL } from '@/lib/ai/deepseek';

// Mock LLM layer
vi.mock('@/lib/llm', () => ({
    streamText: vi.fn(),
}));

vi.mock('../prompts', () => ({
    IDENTITY_PROMPT: '你是心灵树洞，一个温暖的倾听者。',
}));

import { streamText } from '@/lib/llm';

const mockStreamText = vi.mocked(streamText);

function createInput(overrides?: Partial<CounselorInput>): CounselorInput {
    return {
        message: '今天心情不好',
        history: [],
        systemPrompt: '你是一个温暖的倾听者，请用共情的方式回应用户。',
        ...overrides,
    };
}

function mockStreamResult() {
    return { streamResult: { toDataStreamResponse: vi.fn() } };
}

describe('CounselorAgent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStreamText.mockResolvedValue({ toDataStreamResponse: vi.fn() } as any);
    });

    // ===== 正常执行 =====

    describe('正常流程', () => {
        it('正常调用 → 返回 streamResult', async () => {
            const agent = getCounselorAgent();
            const result = await agent.run(createInput());
            expect(result.success).toBe(true);
            expect(result.data.streamResult).toBeDefined();
        });

        it('传递 message 到 LLM 消息列表', async () => {
            const agent = getCounselorAgent();
            await agent.run(createInput({ message: '我很焦虑' }));

            const messages = mockStreamText.mock.calls[0][0] as any[];
            const userMsg = messages.find((m: any) => m.role === 'user');
            expect(userMsg.content).toBe('我很焦虑');
        });

        it('传递 history 到 LLM 消息列表', async () => {
            const history = [
                { role: 'user' as const, content: '我最近压力很大' },
                { role: 'assistant' as const, content: '能说说具体是什么让你感到压力吗？' },
            ];
            const agent = getCounselorAgent();
            await agent.run(createInput({ history }));

            const messages = mockStreamText.mock.calls[0][0] as any[];
            // system(1) + history(2) + user(1) = 4
            expect(messages.length).toBe(4);
        });
    });

    // ===== 安全约束注入 =====

    describe('安全约束注入', () => {
        it('有约束 → 注入到 system prompt', async () => {
            const agent = getCounselorAgent();
            await agent.run(createInput({
                safetyConstraints: ['必须提供紧急热线', '不进行认知挑战'],
            }));

            const messages = mockStreamText.mock.calls[0][0] as any[];
            const systemMsg = messages.find((m: any) => m.role === 'system');
            expect(systemMsg.content).toContain('安全约束（必须遵守）');
            expect(systemMsg.content).toContain('必须提供紧急热线');
            expect(systemMsg.content).toContain('不进行认知挑战');
        });

        it('无约束 → 不修改 system prompt', async () => {
            const basePrompt = '你是一个温暖的倾听者。';
            const agent = getCounselorAgent();
            await agent.run(createInput({
                systemPrompt: basePrompt,
                safetyConstraints: [],
            }));

            const messages = mockStreamText.mock.calls[0][0] as any[];
            const systemMsg = messages.find((m: any) => m.role === 'system');
            expect(systemMsg.content).not.toContain('安全约束');
        });

        it('空约束数组 → 不修改', async () => {
            const agent = getCounselorAgent();
            await agent.run(createInput({ safetyConstraints: undefined }));

            const messages = mockStreamText.mock.calls[0][0] as any[];
            const systemMsg = messages.find((m: any) => m.role === 'system');
            expect(systemMsg.content).not.toContain('安全约束');
        });
    });

    // ===== 记忆上下文注入 =====

    describe('记忆上下文', () => {
        it('有记忆 → 注入到 system prompt', async () => {
            const agent = getCounselorAgent();
            await agent.run(createInput({
                memoryContext: '## 用户画像\n用户最近经常提到工作压力',
            }));

            const messages = mockStreamText.mock.calls[0][0] as any[];
            const systemMsg = messages.find((m: any) => m.role === 'system');
            expect(systemMsg.content).toContain('用户画像');
            expect(systemMsg.content).toContain('工作压力');
        });

        it('无记忆 → 不注入', async () => {
            const basePrompt = '你是倾听者。';
            const agent = getCounselorAgent();
            await agent.run(createInput({
                systemPrompt: basePrompt,
                memoryContext: undefined,
            }));

            const messages = mockStreamText.mock.calls[0][0] as any[];
            const systemMsg = messages.find((m: any) => m.role === 'system');
            expect(systemMsg.content).toBe(basePrompt);
        });
    });

    // ===== LLM 参数传递 =====

    describe('LLM 参数', () => {
        it('默认 temperature=0.8, maxTokens=400', async () => {
            const agent = getCounselorAgent();
            await agent.run(createInput());

            const options = mockStreamText.mock.calls[0][1] as any;
            expect(options.temperature).toBe(0.8);
            expect(options.max_tokens).toBe(400);
        });

        it('自定义 temperature 和 maxTokens', async () => {
            const agent = getCounselorAgent();
            await agent.run(createInput({ temperature: 0.5, maxTokens: 200 }));

            const options = mockStreamText.mock.calls[0][1] as any;
            expect(options.temperature).toBe(0.5);
            expect(options.max_tokens).toBe(200);
        });

        it('传递 provider override', async () => {
            const agent = getCounselorAgent();
            await agent.run(createInput({ provider: 'openai' as any }));

            const options = mockStreamText.mock.calls[0][1] as any;
            expect(options.provider).toBe('openai');
        });

        it('传递 modelOverride', async () => {
            const agent = getCounselorAgent();
            await agent.run(createInput({ modelOverride: 'gpt-4o' }));

            const options = mockStreamText.mock.calls[0][1] as any;
            expect(options.modelOverride).toBe('gpt-4o');
        });

        it('默认 enableTools=true', async () => {
            const agent = getCounselorAgent();
            await agent.run(createInput());

            const options = mockStreamText.mock.calls[0][1] as any;
            expect(options.enableTools).toBe(true);
        });

        it('onFinish 回调传递', async () => {
            const onFinish = vi.fn();
            const agent = getCounselorAgent();
            await agent.run(createInput({ onFinish }));

            const options = mockStreamText.mock.calls[0][1] as any;
            expect(options.onFinish).toBe(onFinish);
        });
    });

    // ===== 降级 =====

    describe('降级', () => {
        it('LLM 异常 → fallbackData 为 null', async () => {
            mockStreamText.mockRejectedValue(new Error('API error'));
            const agent = getCounselorAgent();
            const result = await agent.run(createInput());
            expect(result.success).toBe(false);
            expect(result.data).toBeNull();
        });

        it('LLM 超时 → fallbackData 为 null', async () => {
            mockStreamText.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve({} as any), 60000))
            );
            const agent = getCounselorAgent();
            const result = await agent.run(createInput());
            expect(result.success).toBe(false);
            expect(result.data).toBeNull();
        }, 35000);
    });

    // ===== Agent 元数据 =====

    describe('元数据', () => {
        it('name 为 counselor', () => {
            expect(getCounselorAgent().name).toBe('counselor');
        });

        it('model 为 DEEPSEEK_MODEL', () => {
            expect(getCounselorAgent().model).toBe(DEEPSEEK_MODEL);
        });
    });
});
