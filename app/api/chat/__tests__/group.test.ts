/**
 * 圆桌论道 API 测试
 * POST /api/chat/group
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ====== Mock 外部依赖 ======

vi.mock('@/auth', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-1' } }),
}));

vi.mock('@/lib/db/prisma', () => ({
    prisma: {
        labSession: {
            create: vi.fn().mockResolvedValue({ id: 'group-session-1' }),
            update: vi.fn().mockResolvedValue({}),
            count: vi.fn().mockResolvedValue(0),
            findUnique: vi.fn().mockResolvedValue(null),
        },
        labMessage: {
            createMany: vi.fn().mockResolvedValue({ count: 5 }),
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
        },
    },
}));

// 内存限流器是真实现（10 次/分钟/用户），本文件 15+ 个用例共用同一 userId 会被真限流打爆
vi.mock('@/lib/api/rate-limit', () => ({
    checkRateLimit: vi.fn().mockReturnValue({ success: true }),
}));

vi.mock('@/lib/ai/guardrails', () => ({
    guardInput: vi.fn().mockReturnValue({ safe: true }),
    getBlockedResponse: vi.fn().mockReturnValue('抱歉，我无法回应这类内容。'),
}));

vi.mock('@/lib/memory/lab-extractor', () => ({
    extractLabInsights: vi.fn().mockResolvedValue(0),
}));

// Mock orchestrateGroupChat 为 async generator
async function* mockGenerator() {
    yield { type: 'mentor_start', mentorId: 'socrates', round: 1 };
    yield { type: 'mentor_chunk', mentorId: 'socrates', content: '苏格拉底认为' };
    yield { type: 'mentor_end', mentorId: 'socrates', round: 1 };
    yield { type: 'mentor_start', mentorId: 'jung', round: 1 };
    yield { type: 'mentor_chunk', mentorId: 'jung', content: '荣格认为' };
    yield { type: 'mentor_end', mentorId: 'jung', round: 1 };
    yield { type: 'synthesis', content: '综合来看...' };
}

vi.mock('@/lib/ai/group/orchestrator', () => ({
    orchestrateGroupChat: vi.fn().mockReturnValue(mockGenerator()),
}));

vi.mock('@/lib/observability/trace-context', () => ({
    runWithTrace: vi.fn((_name: string, _meta: any, fn: () => any) => fn()),
    getCurrentTrace: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/observability/langfuse', () => ({
    updateTrace: vi.fn(),
}));

// ====== 导入被测模块 ======
import { POST } from '../group/route';
import { auth } from '@/auth';
import { guardInput } from '@/lib/ai/guardrails';
import { orchestrateGroupChat } from '@/lib/ai/group/orchestrator';

function createRequest(body: any) {
    return new Request('http://localhost:3002/api/chat/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }) as any;
}

const validBody = {
    messages: [{ role: 'user' as const, content: '人应该追求自由还是安全？' }],
    mentorIds: ['socrates', 'jung'],
    mode: 'discuss' as const,
    topic: '自由与安全',
};

// 辅助函数：读取 SSE stream 内容
async function readSSEStream(response: Response): Promise<string[]> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const events: string[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
            if (line.startsWith('data: ')) {
                events.push(line.slice(6));
            }
        }
    }
    return events;
}

describe('POST /api/chat/group', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (auth as any).mockResolvedValue({ user: { id: 'test-user-1' } });
        (guardInput as any).mockReturnValue({ safe: true });
        // Reset generator mock for each test
        (orchestrateGroupChat as any).mockReturnValue(mockGenerator());
    });

    // ====== 认证 ======
    it('未登录 → 401', async () => {
        (auth as any).mockResolvedValue(null);
        const res = await POST(createRequest(validBody));
        expect(res.status).toBe(401);
    });

    // ====== 输入校验 ======
    it('大师数量 < 2 → 400', async () => {
        const res = await POST(createRequest({ ...validBody, mentorIds: ['socrates'] }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('2-4');
    });

    it('大师数量 > 4 → 400', async () => {
        const res = await POST(createRequest({
            ...validBody,
            mentorIds: ['socrates', 'jung', 'adler', 'seligman', 'satir'],
        }));
        expect(res.status).toBe(400);
    });

    it('空消息 → 400', async () => {
        const res = await POST(createRequest({ ...validBody, messages: [] }));
        expect(res.status).toBe(400);
    });

    it('非法 intent → 400', async () => {
        const res = await POST(createRequest({ ...validBody, intent: 'skip-round' }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('不支持');
    });

    it('mentorIds 不是数组 → 400', async () => {
        const res = await POST(createRequest({ ...validBody, mentorIds: 'socrates' }));
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
    it('正常请求 → SSE 流式响应', async () => {
        const res = await POST(createRequest(validBody));
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    });

    it('SSE 事件包含 mentor_start/mentor_end/synthesis', async () => {
        const res = await POST(createRequest(validBody));
        const events = await readSSEStream(res);
        const types = events.map(e => JSON.parse(e).type);
        expect(types).toContain('mentor_start');
        expect(types).toContain('mentor_end');
        expect(types).toContain('synthesis');
    });

    it('SSE 不暴露内部事件 (phase_metrics/stance_analysis)', async () => {
        // Generator 已在 route.ts 中过滤 phase_metrics 和 stance_analysis
        const res = await POST(createRequest(validBody));
        const events = await readSSEStream(res);
        const types = events.map(e => JSON.parse(e).type);
        expect(types).not.toContain('phase_metrics');
        expect(types).not.toContain('stance_analysis');
    });

    it('每位导师都有 mentor_start → mentor_chunk → mentor_end 序列', async () => {
        const res = await POST(createRequest(validBody));
        const events = await readSSEStream(res);
        const parsed = events.map(e => JSON.parse(e));

        // 验证苏格拉底的事件序列
        const socratesEvents = parsed.filter(e => e.mentorId === 'socrates');
        expect(socratesEvents.map(e => e.type)).toEqual(['mentor_start', 'mentor_chunk', 'mentor_end']);

        // 验证荣格的事件序列
        const jungEvents = parsed.filter(e => e.mentorId === 'jung');
        expect(jungEvents.map(e => e.type)).toEqual(['mentor_start', 'mentor_chunk', 'mentor_end']);
    });

    it('正确调用 orchestrateGroupChat', async () => {
        await POST(createRequest(validBody));
        // 等流读完
        expect(orchestrateGroupChat).toHaveBeenCalledWith(
            expect.objectContaining({
                mentorIds: ['socrates', 'jung'],
                mode: 'discuss',
                topic: '自由与安全',
            }),
        );
    });

    it('总结观点 → 传递 summarize intent 给 orchestrator', async () => {
        await POST(createRequest({ ...validBody, intent: 'summarize' }));
        expect(orchestrateGroupChat).toHaveBeenCalledWith(
            expect.objectContaining({
                intent: 'summarize',
            }),
        );
    });

    // ====== 讨论 vs 辩论模式 ======
    it('辩论模式 → 传递 mode=debate', async () => {
        await POST(createRequest({ ...validBody, mode: 'debate' }));
        expect(orchestrateGroupChat).toHaveBeenCalledWith(
            expect.objectContaining({ mode: 'debate' }),
        );
    });

    // ====== 不同人数组合 ======
    it('3 人组合 → 200', async () => {
        const res = await POST(createRequest({
            ...validBody,
            mentorIds: ['socrates', 'jung', 'adler'],
        }));
        expect(res.status).toBe(200);
    });

    it('4 人组合 → 200', async () => {
        const res = await POST(createRequest({
            ...validBody,
            mentorIds: ['socrates', 'jung', 'adler', 'seligman'],
        }));
        expect(res.status).toBe(200);
    });

    // ====== 空响应回归（复现 3878fe5 bug） ======
    it('orchestrator 产出空事件 → 不崩溃', async () => {
        async function* emptyGenerator() {
            // 空 generator，模拟无输出
        }
        (orchestrateGroupChat as any).mockReturnValue(emptyGenerator());
        const res = await POST(createRequest(validBody));
        expect(res.status).toBe(200);
        const events = await readSSEStream(res);
        // 新开桌会先发 lab_session 事件；orchestrator 无输出时不应有其他事件
        const nonSessionEvents = events.filter(e => JSON.parse(e).type !== 'lab_session');
        expect(nonSessionEvents.length).toBe(0); // 正常返回空流，不 crash
    });

    // ====== 错误处理 ======
    it('orchestrator 抛异常 → SSE error 事件', async () => {
        async function* errorGenerator() {
            yield { type: 'mentor_start', mentorId: 'socrates', round: 1 };
            throw new Error('LLM timeout');
        }
        (orchestrateGroupChat as any).mockReturnValue(errorGenerator());
        const res = await POST(createRequest(validBody));
        expect(res.status).toBe(200); // SSE 流已启动，HTTP 200
        const events = await readSSEStream(res);
        const errorEvent = events.find(e => JSON.parse(e).type === 'error');
        expect(errorEvent).toBeDefined();
        expect(JSON.parse(errorEvent!).message).toContain('LLM timeout');
    });
});
