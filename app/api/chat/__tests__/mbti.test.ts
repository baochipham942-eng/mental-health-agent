/**
 * 镜像回廊 API 测试
 * POST /api/chat/mbti
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ====== Mock 外部依赖 ======

vi.mock('@/auth', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-1' } }),
}));

vi.mock('@/lib/memory', () => ({
    memoryContextService: {
        getContext: vi.fn().mockResolvedValue({ injectedText: '' }),
    },
}));

vi.mock('@/lib/ai/deepseek', () => ({
    streamChatCompletion: vi.fn().mockResolvedValue({
        toDataStreamResponse: () => new Response('0:"INTJ 的回复"\n', {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
        }),
    }),
}));

vi.mock('@/lib/ai/guardrails', () => ({
    guardInput: vi.fn().mockReturnValue({ safe: true }),
    getBlockedResponse: vi.fn().mockReturnValue('抱歉，我无法回应这类内容。'),
}));

// ====== 导入被测模块 ======
import { POST } from '../mbti/route';
import { auth } from '@/auth';
import { guardInput } from '@/lib/ai/guardrails';
import { streamChatCompletion } from '@/lib/ai/deepseek';

function createRequest(body: any) {
    return new Request('http://localhost:3002/api/chat/mbti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }) as any;
}

const validBody = {
    messages: [{ role: 'user', content: '你怎么看待独处？' }],
    mbtiType: 'INTJ',
};

describe('POST /api/chat/mbti', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (auth as any).mockResolvedValue({ user: { id: 'test-user-1' } });
        (guardInput as any).mockReturnValue({ safe: true });
    });

    // ====== 认证 ======
    it('未登录 → 401', async () => {
        (auth as any).mockResolvedValue(null);
        const res = await POST(createRequest(validBody));
        expect(res.status).toBe(401);
    });

    // ====== 输入校验 ======
    it('空消息 → 400', async () => {
        const res = await POST(createRequest({ messages: [{ role: 'user', content: '  ' }], mbtiType: 'INTJ' }));
        expect(res.status).toBe(400);
    });

    it('无效 MBTI 类型 → 400', async () => {
        const res = await POST(createRequest({ messages: [{ role: 'user', content: '你好' }], mbtiType: 'XXXX' }));
        expect(res.status).toBe(400);
    });

    it('缺少 MBTI 类型 → 400', async () => {
        const res = await POST(createRequest({ messages: [{ role: 'user', content: '你好' }] }));
        expect(res.status).toBe(400);
    });

    // ====== Input Guard ======
    it('注入攻击被拦截', async () => {
        (guardInput as any).mockReturnValue({ safe: false, reason: 'injection' });
        const res = await POST(createRequest(validBody));
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain('抱歉');
    });

    // ====== 正常流 ======
    it('正常消息 → 200 流式响应', async () => {
        const res = await POST(createRequest(validBody));
        expect(res.status).toBe(200);
    });

    it('正常消息 → 调用 streamChatCompletion', async () => {
        await POST(createRequest(validBody));
        expect(streamChatCompletion).toHaveBeenCalledTimes(1);
        const callArgs = (streamChatCompletion as any).mock.calls[0];
        // 第一个参数是 messages 数组，第一条应是 system prompt
        expect(callArgs[0][0].role).toBe('system');
    });

    it('记忆上下文注入到 system prompt', async () => {
        const { memoryContextService } = await import('@/lib/memory');
        (memoryContextService.getContext as any).mockResolvedValue({ injectedText: '用户喜欢哲学讨论' });

        await POST(createRequest(validBody));

        const callArgs = (streamChatCompletion as any).mock.calls[0];
        const systemPrompt = callArgs[0][0].content;
        expect(systemPrompt).toContain('用户喜欢哲学讨论');
    });

    // ====== 16 种 MBTI 类型覆盖 ======
    const allTypes = [
        'INTJ', 'INTP', 'ENTJ', 'ENTP',
        'INFJ', 'INFP', 'ENFJ', 'ENFP',
        'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
        'ISTP', 'ISFP', 'ESTP', 'ESFP',
    ];
    for (const type of allTypes) {
        it(`MBTI 类型 ${type} → 200`, async () => {
            const res = await POST(createRequest({ messages: [{ role: 'user', content: '你好' }], mbtiType: type }));
            expect(res.status).toBe(200);
        });
    }

    // ====== 无持久化（MBTI 是只读的） ======
    it('不写入数据库（只读模式）', async () => {
        // MBTI 路由不导入 prisma，不写 LabSession/LabMessage
        // 如果有 prisma 调用则说明路由有变更
        await POST(createRequest(validBody));
        // 测试通过本身就验证了不会因 prisma 未 mock 而报错
    });
});
