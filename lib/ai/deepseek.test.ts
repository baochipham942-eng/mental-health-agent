import { describe, it, expect, vi, afterEach } from 'vitest';

// vi.hoisted runs BEFORE any imports are resolved,
// so the module-level `const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY` picks this up.
vi.hoisted(() => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
});

import { chatCompletion, chatStructuredCompletion, deepseekNoThinkingFetch } from './deepseek';

function mockFetch(data: any, ok = true, status = 200) {
    return vi.spyOn(global, 'fetch').mockResolvedValue({
        ok,
        status,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    } as Response);
}

function makeApiResponse(content: string, refusal?: string | null) {
    return {
        id: 'test-id',
        choices: [{
            message: { role: 'assistant', content, refusal },
            finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    };
}

describe('chatCompletion', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
        fetchSpy?.mockRestore();
    });

    it('正常调用返回 { reply }', async () => {
        fetchSpy = mockFetch(makeApiResponse('你好'));
        const result = await chatCompletion([{ role: 'user', content: 'hi' }]);
        expect(result.reply).toBe('你好');
    });

    it('API 返回非 200 → 抛出 Error', async () => {
        fetchSpy = mockFetch('rate limit exceeded', false, 429);
        await expect(chatCompletion([{ role: 'user', content: 'hi' }]))
            .rejects.toThrow('DeepSeek API error: 429');
    });

    it('空 choices 数组 → 抛出 Error', async () => {
        fetchSpy = mockFetch({
            id: 'test-id',
            choices: [],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
        await expect(chatCompletion([{ role: 'user', content: 'hi' }]))
            .rejects.toThrow('No response from DeepSeek API');
    });

    it('自动为第一条 system 消息添加 cache_control', async () => {
        fetchSpy = mockFetch(makeApiResponse('ok'));
        await chatCompletion([
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'hi' },
        ]);
        const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
        expect(body.messages[0].cache_control).toEqual({ type: 'ephemeral' });
        // Second message should NOT have cache_control added
        expect(body.messages[1].cache_control).toBeUndefined();
    });

    it('正确传递 temperature / max_tokens', async () => {
        fetchSpy = mockFetch(makeApiResponse('ok'));
        await chatCompletion([{ role: 'user', content: 'hi' }], {
            temperature: 0.2,
            max_tokens: 500,
        });
        const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
        expect(body.temperature).toBe(0.2);
        expect(body.max_tokens).toBe(500);
    });

    it('模型拒绝 → 抛出 Error', async () => {
        fetchSpy = mockFetch(makeApiResponse('', 'I cannot help with that'));
        await expect(chatCompletion([{ role: 'user', content: 'bad' }]))
            .rejects.toThrow('AI refused to respond');
    });

    it('deepseek-v4 请求体自动注入 thinking disabled', async () => {
        fetchSpy = mockFetch(makeApiResponse('ok'));
        await chatCompletion([{ role: 'user', content: 'hi' }]);
        const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
        expect(body.thinking).toEqual({ type: 'disabled' });
    });
});

describe('deepseekNoThinkingFetch', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
        fetchSpy?.mockRestore();
    });

    function sentBody() {
        return JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    }

    it('deepseek-v4 模型 → 注入 thinking disabled', async () => {
        fetchSpy = mockFetch({});
        await deepseekNoThinkingFetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [] }),
        });
        expect(sentBody().thinking).toEqual({ type: 'disabled' });
    });

    it('非 v4 模型 → 请求体不动', async () => {
        fetchSpy = mockFetch({});
        await deepseekNoThinkingFetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            body: JSON.stringify({ model: 'some-other-model', messages: [] }),
        });
        expect(sentBody().thinking).toBeUndefined();
    });

    it('已显式设置 thinking → 不覆盖', async () => {
        fetchSpy = mockFetch({});
        await deepseekNoThinkingFetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            body: JSON.stringify({ model: 'deepseek-v4-flash', thinking: { type: 'enabled' } }),
        });
        expect(sentBody().thinking).toEqual({ type: 'enabled' });
    });

    // ====== 流式路径 cache_control（对齐非流式 chatCompletion 的注入策略） ======

    it('首条 system 消息 → 注入 cache_control', async () => {
        fetchSpy = mockFetch({});
        await deepseekNoThinkingFetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            body: JSON.stringify({
                model: 'deepseek-v4-flash',
                messages: [
                    { role: 'system', content: 'sys prompt' },
                    { role: 'user', content: 'hi' },
                ],
            }),
        });
        expect(sentBody().messages[0].cache_control).toEqual({ type: 'ephemeral' });
        expect(sentBody().messages[1].cache_control).toBeUndefined();
        // thinking disabled 注入不受影响
        expect(sentBody().thinking).toEqual({ type: 'disabled' });
    });

    it('首条消息不是 system → 不注入 cache_control', async () => {
        fetchSpy = mockFetch({});
        await deepseekNoThinkingFetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            body: JSON.stringify({
                model: 'deepseek-v4-flash',
                messages: [{ role: 'user', content: 'hi' }],
            }),
        });
        expect(sentBody().messages[0].cache_control).toBeUndefined();
    });

    it('已显式设置 cache_control → 不覆盖', async () => {
        fetchSpy = mockFetch({});
        await deepseekNoThinkingFetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            body: JSON.stringify({
                model: 'deepseek-v4-flash',
                messages: [{ role: 'system', content: 'sys', cache_control: { type: 'custom' } }],
            }),
        });
        expect(sentBody().messages[0].cache_control).toEqual({ type: 'custom' });
    });
});

describe('chatStructuredCompletion', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    const mockSchema = {
        parse: (val: any) => {
            if (!val || typeof val !== 'object') throw new Error('Invalid');
            return val;
        },
    };

    afterEach(() => {
        fetchSpy?.mockRestore();
    });

    it('正常 JSON → 通过 schema 正确解析', async () => {
        fetchSpy = mockFetch(makeApiResponse('{"name":"test","value":42}'));
        const result = await chatStructuredCompletion(
            [{ role: 'user', content: 'hi' }],
            mockSchema,
        );
        expect(result).toEqual({ name: 'test', value: 42 });
    });

    it('Markdown 包裹的 JSON → 清理后解析', async () => {
        fetchSpy = mockFetch(makeApiResponse('```json\n{"name":"test"}\n```'));
        const result = await chatStructuredCompletion(
            [{ role: 'user', content: 'hi' }],
            mockSchema,
        );
        expect(result).toEqual({ name: 'test' });
    });

    it('正则提取 { ... } 模式生效', async () => {
        // 前面有一些文字，但包含一个 JSON 对象
        fetchSpy = mockFetch(makeApiResponse('Here is the result: {"key":"val"} done'));
        const result = await chatStructuredCompletion(
            [{ role: 'user', content: 'hi' }],
            mockSchema,
        );
        expect(result).toEqual({ key: 'val' });
    });

    it('所有解析尝试失败 → 抛出 Error', async () => {
        fetchSpy = mockFetch(makeApiResponse('this is not json at all'));
        await expect(chatStructuredCompletion(
            [{ role: 'user', content: 'hi' }],
            mockSchema,
        )).rejects.toThrow('Failed to parse structured output from AI');
    });

    it('schema 校验失败 → 抛出 Error', async () => {
        const strictSchema = {
            parse: (_val: any) => { throw new Error('Schema validation failed'); },
        };
        fetchSpy = mockFetch(makeApiResponse('{"valid":"json"}'));
        await expect(chatStructuredCompletion(
            [{ role: 'user', content: 'hi' }],
            strictSchema,
        )).rejects.toThrow('Schema validation failed');
    });
});
