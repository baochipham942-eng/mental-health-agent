/**
 * DeepSeek API mock 工厂
 * 用于测试中 mock chatCompletion / chatStructuredCompletion
 */
import { vi } from 'vitest';

/**
 * 创建一个成功的 chatCompletion mock 响应
 */
export function mockChatCompletionSuccess(reply: string) {
    return vi.fn().mockResolvedValue({ reply });
}

/**
 * 创建一个失败的 chatCompletion mock
 */
export function mockChatCompletionError(message: string = 'API Error') {
    return vi.fn().mockRejectedValue(new Error(message));
}

/**
 * 创建一个成功的 chatStructuredCompletion mock 响应
 */
export function mockStructuredCompletionSuccess<T>(result: T) {
    return vi.fn().mockResolvedValue(result);
}

/**
 * 创建一个失败的 chatStructuredCompletion mock
 */
export function mockStructuredCompletionError(message: string = 'Structured parse error') {
    return vi.fn().mockRejectedValue(new Error(message));
}

/**
 * 创建一个 mock fetch 响应（用于直接 mock global.fetch）
 */
export function createMockFetchResponse(data: any, ok: boolean = true, status: number = 200) {
    return vi.fn().mockResolvedValue({
        ok,
        status,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.stringify(data)),
    });
}

/**
 * 标准 DeepSeek API 成功响应数据
 */
export function createDeepSeekResponse(content: string, usage?: any) {
    return {
        id: 'mock-response-id',
        choices: [{
            message: { role: 'assistant', content },
            finish_reason: 'stop',
        }],
        usage: usage ?? {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
        },
    };
}
