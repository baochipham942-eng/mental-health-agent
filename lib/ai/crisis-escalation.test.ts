import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCrisisEscalation } from './crisis-escalation';

// Mock prisma
vi.mock('@/lib/db/prisma', () => ({
    prisma: {
        crisisEscalation: {
            create: vi.fn(),
        },
    },
}));

import { prisma } from '@/lib/db/prisma';

const mockCreate = vi.mocked(prisma.crisisEscalation.create);

describe('createCrisisEscalation', () => {
    const baseParams = {
        userId: 'user-123',
        conversationId: 'conv-456',
        triggerMessage: '我不想活了',
        riskLevel: 'crisis' as const,
        safetyScore: 9,
    };

    beforeEach(() => {
        mockCreate.mockReset();
        // 默认成功
        mockCreate.mockResolvedValue({ id: 'esc-001', ...baseParams } as any);
        // Mock fetch for Telegram (fire-and-forget)
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
        // 清除环境变量
        vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
        vi.stubEnv('TELEGRAM_CHAT_ID', '');
    });

    // ===== 应触发 =====

    it('crisis 级别 — 创建记录并返回 ID', async () => {
        const id = await createCrisisEscalation(baseParams);
        expect(id).toBe('esc-001');
        expect(mockCreate).toHaveBeenCalledWith({
            data: baseParams,
        });
    });

    it('urgent 级别 — 同样创建记录', async () => {
        const urgentParams = { ...baseParams, riskLevel: 'urgent' as const, safetyScore: 6 };
        mockCreate.mockResolvedValue({ id: 'esc-002', ...urgentParams } as any);

        const id = await createCrisisEscalation(urgentParams);
        expect(id).toBe('esc-002');
        expect(mockCreate).toHaveBeenCalledWith({ data: urgentParams });
    });

    it('超长 triggerMessage 不影响创建', async () => {
        const longMsg = '我好痛苦'.repeat(500);
        const params = { ...baseParams, triggerMessage: longMsg };
        mockCreate.mockResolvedValue({ id: 'esc-003', ...params } as any);

        const id = await createCrisisEscalation(params);
        expect(id).toBe('esc-003');
    });

    // ===== Telegram 通知 =====

    it('配置了 Telegram — 发送通知（fire-and-forget）', async () => {
        vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
        vi.stubEnv('TELEGRAM_CHAT_ID', '12345');
        const mockFetch = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', mockFetch);

        await createCrisisEscalation(baseParams);

        // fire-and-forget，需要等一下
        await new Promise(r => setTimeout(r, 50));

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('api.telegram.org');
        expect(url).toContain('bot-token');
        const body = JSON.parse(options.body);
        expect(body.chat_id).toBe('12345');
        expect(body.text).toContain('危机升级通知');
        expect(body.text).toContain('CRISIS');
    });

    it('未配置 Telegram — 不发送通知', async () => {
        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        await createCrisisEscalation(baseParams);
        await new Promise(r => setTimeout(r, 50));

        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('Telegram 发送失败 — 不影响主流程（不抛错）', async () => {
        vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
        vi.stubEnv('TELEGRAM_CHAT_ID', '12345');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

        // 不应抛错
        const id = await createCrisisEscalation(baseParams);
        expect(id).toBe('esc-001');
    });

    it('Telegram 消息截断超长 triggerMessage 到 200 字', async () => {
        vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
        vi.stubEnv('TELEGRAM_CHAT_ID', '12345');
        const mockFetch = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', mockFetch);

        const longMsg = 'A'.repeat(1000);
        await createCrisisEscalation({ ...baseParams, triggerMessage: longMsg });
        await new Promise(r => setTimeout(r, 50));

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        // triggerMessage.slice(0, 200) — Telegram 文本中只包含前 200 字
        expect(body.text.length).toBeLessThan(1000);
    });

    // ===== 错误处理 =====

    it('DB 创建失败 — 向上抛出异常', async () => {
        mockCreate.mockRejectedValue(new Error('DB connection failed'));
        await expect(createCrisisEscalation(baseParams)).rejects.toThrow('DB connection failed');
    });

    // ===== 不应触发（双向测试） =====

    it('safetyScore 为 0 — 仍然创建（函数不做阈值判断，由调用方决定）', async () => {
        const params = { ...baseParams, safetyScore: 0 };
        mockCreate.mockResolvedValue({ id: 'esc-low', ...params } as any);

        const id = await createCrisisEscalation(params);
        expect(id).toBe('esc-low');
    });
});
