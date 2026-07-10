/**
 * Cron 鉴权 fail-closed：CRON_SECRET 未配置时必须 500 拒绝，
 * 否则 'Bearer undefined' 字面量可通过 `Bearer ${undefined}` 校验。
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server.js';

vi.mock('@/lib/memory/data-bridge', () => ({
    deleteExpiredProfileMemories: vi.fn().mockResolvedValue(3),
}));

import { GET } from './route';

function makeRequest(authHeader?: string) {
    return new NextRequest('http://localhost/api/cron/prune-memory', {
        headers: authHeader ? { authorization: authHeader } : {},
    });
}

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
    if (originalSecret === undefined) {
        delete process.env.CRON_SECRET;
    } else {
        process.env.CRON_SECRET = originalSecret;
    }
});

describe('GET /api/cron/prune-memory 鉴权', () => {
    it('CRON_SECRET 未配置时返回 500，Bearer undefined 不再可过', async () => {
        delete process.env.CRON_SECRET;
        const res = await GET(makeRequest('Bearer undefined'));
        expect(res.status).toBe(500);
    });

    it('secret 错误返回 401', async () => {
        process.env.CRON_SECRET = 'right-secret';
        const res = await GET(makeRequest('Bearer wrong-secret'));
        expect(res.status).toBe(401);
    });

    it('secret 正确返回 200', async () => {
        process.env.CRON_SECRET = 'right-secret';
        const res = await GET(makeRequest('Bearer right-secret'));
        expect(res.status).toBe(200);
    });
});
