import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateText, generateStructured, streamText } from './index';
import type { ChatMessage } from './index';

// Mock 依赖
vi.mock('@/lib/ai/deepseek', () => ({
    chatCompletion: vi.fn().mockResolvedValue({ reply: 'deepseek reply' }),
    chatStructuredCompletion: vi.fn().mockResolvedValue({ key: 'value' }),
    streamChatCompletion: vi.fn().mockResolvedValue({ stream: true }),
}));

vi.mock('./resilience', () => ({
    withResilience: vi.fn((fn: Function) => fn()),
}));

vi.mock('./openai-compat-provider', () => ({
    createOpenAICompatProvider: vi.fn(() => ({
        generateText: vi.fn().mockResolvedValue({ reply: 'compat reply' }),
        generateStructured: vi.fn().mockResolvedValue({ key: 'compat' }),
        streamText: vi.fn().mockResolvedValue({ stream: 'compat' }),
    })),
}));

import { chatCompletion, chatStructuredCompletion, streamChatCompletion } from '@/lib/ai/deepseek';
import { withResilience } from './resilience';

const mockChatCompletion = vi.mocked(chatCompletion);
const mockStructured = vi.mocked(chatStructuredCompletion);
const mockStreamChat = vi.mocked(streamChatCompletion);
const mockResilience = vi.mocked(withResilience);

const sampleMessages: ChatMessage[] = [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' },
];

describe('generateText', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResilience.mockImplementation((fn: any) => fn());
    });

    it('默认 → deepseek provider', async () => {
        const result = await generateText(sampleMessages);
        expect(result.reply).toBe('deepseek reply');
        expect(mockChatCompletion).toHaveBeenCalled();
    });

    it('显式指定 deepseek', async () => {
        await generateText(sampleMessages, { provider: 'deepseek' });
        expect(mockChatCompletion).toHaveBeenCalled();
    });

    it('经过 resilience 包装', async () => {
        await generateText(sampleMessages);
        expect(mockResilience).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ label: 'deepseek-generateText' }),
        );
    });

    it('指定 glm/openrouter/kimi/openai → 走 compat provider', async () => {
        for (const provider of ['glm', 'openrouter', 'kimi', 'openai'] as const) {
            vi.clearAllMocks();
            mockResilience.mockImplementation((fn: any) => fn());

            await generateText(sampleMessages, { provider });
            // 不应调用 deepseek
            expect(mockChatCompletion).not.toHaveBeenCalled();
        }
    });

    it('环境变量 DEFAULT_LLM_PROVIDER 生效', async () => {
        vi.stubEnv('DEFAULT_LLM_PROVIDER', 'glm');
        mockResilience.mockImplementation((fn: any) => fn());

        await generateText(sampleMessages);
        // 应该走 compat（glm），不走 deepseek
        expect(mockChatCompletion).not.toHaveBeenCalled();

        vi.stubEnv('DEFAULT_LLM_PROVIDER', '');
    });
});

describe('generateStructured', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        mockResilience.mockImplementation((fn: any) => fn());
    });

    it('默认 → deepseek structured', async () => {
        const schema = { parse: (v: any) => v };
        const result = await generateStructured(sampleMessages, schema);
        expect(result).toEqual({ key: 'value' });
    });

    it('经过 resilience 包装', async () => {
        const schema = { parse: (v: any) => v };
        await generateStructured(sampleMessages, schema);
        expect(mockResilience).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ label: 'deepseek-generateStructured' }),
        );
    });
});

describe('streamText', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });

    it('默认 → deepseek stream', async () => {
        const result = await streamText(sampleMessages);
        expect(result).toEqual({ stream: true });
        expect(mockStreamChat).toHaveBeenCalled();
    });

    it('不经过 resilience（流式不适合重试）', async () => {
        await streamText(sampleMessages);
        // streamText 不调用 withResilience
        expect(mockResilience).not.toHaveBeenCalled();
    });

    it('传递 options 到底层', async () => {
        await streamText(sampleMessages, {
            temperature: 0.5,
            max_tokens: 200,
            enableTools: false,
        });
        expect(mockStreamChat).toHaveBeenCalledWith(
            sampleMessages,
            expect.objectContaining({
                temperature: 0.5,
                max_tokens: 200,
                enableTools: false,
            }),
        );
    });
});
