import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withResilience } from './resilience';

describe('withResilience', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ===== 正常执行 =====

    it('成功 → 直接返回结果', async () => {
        const fn = vi.fn().mockResolvedValue('success');
        const result = await withResilience(fn, { label: 'test' });
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    // ===== 超时 =====

    it('超时 → 抛出 Timeout 错误', async () => {
        const fn = vi.fn(() => new Promise(resolve => setTimeout(() => resolve('late'), 5000)));

        await expect(
            withResilience(fn, { timeoutMs: 50, maxRetries: 0, label: 'timeout-test' })
        ).rejects.toThrow(/Timeout/);
    });

    // ===== 重试 =====

    it('5xx 错误 → 重试 1 次', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('500 Internal Server Error'))
            .mockResolvedValueOnce('recovered');

        const result = await withResilience(fn, { maxRetries: 1, timeoutMs: 5000, label: 'retry-test' });
        expect(result).toBe('recovered');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('网络错误 → 重试', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('ECONNREFUSED'))
            .mockResolvedValueOnce('ok');

        const result = await withResilience(fn, { maxRetries: 1, timeoutMs: 5000, label: 'net-test' });
        expect(result).toBe('ok');
    });

    it('429 限流 → 重试', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('429 Too Many Requests'))
            .mockResolvedValueOnce('ok');

        const result = await withResilience(fn, { maxRetries: 1, timeoutMs: 5000, label: 'rate-test' });
        expect(result).toBe('ok');
    });

    it('4xx 非限流错误 → 不重试', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('400 Bad Request'));

        await expect(
            withResilience(fn, { maxRetries: 2, timeoutMs: 5000, label: 'no-retry-test' })
        ).rejects.toThrow('400 Bad Request');
        expect(fn).toHaveBeenCalledTimes(1); // 不重试
    });

    it('重试全部失败 → 抛出最后一个错误', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('500 error 1'))
            .mockRejectedValueOnce(new Error('500 error 2'));

        await expect(
            withResilience(fn, { maxRetries: 1, timeoutMs: 5000, label: 'all-fail' })
        ).rejects.toThrow('500 error 2');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('maxRetries=0 → 不重试', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('500 error'));

        await expect(
            withResilience(fn, { maxRetries: 0, timeoutMs: 5000, label: 'no-retry' })
        ).rejects.toThrow('500 error');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    // ===== 退避策略 =====

    it('重试间隔 ≥ 1s（指数退避）', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('500'))
            .mockResolvedValueOnce('ok');

        const start = Date.now();
        await withResilience(fn, { maxRetries: 1, timeoutMs: 10000, label: 'backoff' });
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(900); // ~1000ms with some tolerance
    });

    // ===== 默认值 =====

    it('默认 maxRetries=1, timeoutMs 从环境变量', async () => {
        vi.stubEnv('LLM_TIMEOUT_MS', '3000');
        const fn = vi.fn(() => new Promise(resolve => setTimeout(() => resolve('late'), 5000)));

        await expect(
            withResilience(fn, { maxRetries: 0, label: 'env-timeout' })
        ).rejects.toThrow(/Timeout/);

        vi.stubEnv('LLM_TIMEOUT_MS', '');
    });

    // ===== 非 Error 对象 =====

    it('非 Error 异常 → 不重试', async () => {
        const fn = vi.fn().mockRejectedValue('string error');

        await expect(
            withResilience(fn, { maxRetries: 1, timeoutMs: 5000, label: 'non-error' })
        ).rejects.toBe('string error');
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
