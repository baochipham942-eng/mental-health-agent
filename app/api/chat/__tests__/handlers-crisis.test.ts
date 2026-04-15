import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCrisisRoute } from '../handlers';

// Mock 所有外部依赖
vi.mock('@/lib/ai/crisis', () => ({
    streamCrisisReply: vi.fn(),
}));

vi.mock('@/lib/ai/support', () => ({
    streamSupportReply: vi.fn(),
}));

vi.mock('@/lib/ai/crisis-escalation', () => ({
    createCrisisEscalation: vi.fn().mockResolvedValue('esc-id'),
}));

vi.mock('@/lib/ai/crisis-classifier', () => ({
    assessCrisisDeescalation: vi.fn(),
}));

vi.mock('@/lib/ai/agents/orchestrator', () => ({
    triggerQualityCheck: vi.fn(),
}));

import { streamCrisisReply } from '@/lib/ai/crisis';
import { streamSupportReply } from '@/lib/ai/support';
import { createCrisisEscalation } from '@/lib/ai/crisis-escalation';
import { assessCrisisDeescalation } from '@/lib/ai/crisis-classifier';

const mockStreamCrisis = vi.mocked(streamCrisisReply);
const mockStreamSupport = vi.mocked(streamSupportReply);
const mockCreateEscalation = vi.mocked(createCrisisEscalation);
const mockDeescalation = vi.mocked(assessCrisisDeescalation);

// 创建 mock StreamData（测试桩：绕过 ai SDK StreamData 内部字段约束）
function createMockStreamData() {
    return {
        append: vi.fn(),
        close: vi.fn(),
    } as any;
}

// 创建 mock 流式响应
function createMockStreamResult() {
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('mock response'));
            controller.close();
        },
    });

    return {
        toDataStreamResponse: vi.fn(() => new Response(stream, {
            headers: { 'Content-Type': 'text/plain' },
        })),
    };
}

function createBaseParams(overrides?: Record<string, any>) {
    return {
        data: createMockStreamData(),
        message: '我不想活了',
        history: [] as any[],
        processedHistory: [] as any[],
        sessionId: 'session-123',
        userId: 'user-456',
        traceMetadata: {},
        requestStartedAt: Date.now(),
        saveAssistantMessage: vi.fn().mockResolvedValue(undefined),
        scheduleConversationSummaryRefresh: vi.fn(),
        safetyData: { label: 'crisis', score: 9, constraints: ['必须提供紧急热线'] },
        stateData: { state: 'in_crisis' },
        adaptiveMode: 'guardian' as any,
        emotionObj: { label: 'sadness', score: 8 },
        analysis: { safety: 'crisis' },
        ...overrides,
    };
}

describe('handleCrisisRoute', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStreamCrisis.mockResolvedValue(createMockStreamResult() as any);
        mockStreamSupport.mockResolvedValue(createMockStreamResult() as any);
    });

    // ===== 正常危机流程 =====

    describe('危机触发', () => {
        it('危机消息 — 返回 Response 对象', async () => {
            const params = createBaseParams();
            const response = await handleCrisisRoute(params);

            expect(response).toBeInstanceOf(Response);
            expect(response.status).toBe(200);
        });

        it('危机消息 — 调用 streamCrisisReply', async () => {
            const params = createBaseParams();
            await handleCrisisRoute(params);

            expect(mockStreamCrisis).toHaveBeenCalledTimes(1);
            expect(mockStreamCrisis).toHaveBeenCalledWith(
                params.message,
                params.history,
                false, // state !== 'in_crisis' (没有传 state)
                expect.objectContaining({
                    onFinish: expect.any(Function),
                }),
            );
        });

        it('危机消息 — 创建升级记录', async () => {
            const params = createBaseParams();
            await handleCrisisRoute(params);

            // fire-and-forget
            await new Promise(r => setTimeout(r, 50));

            expect(mockCreateEscalation).toHaveBeenCalledWith({
                userId: 'user-456',
                conversationId: 'session-123',
                triggerMessage: '我不想活了',
                riskLevel: 'crisis',
                safetyScore: 9,
            });
        });

        it('urgent 级别 — riskLevel 为 urgent', async () => {
            const params = createBaseParams({
                analysis: { safety: 'urgent' },
                safetyData: { label: 'urgent', score: 6, constraints: [] },
            });
            await handleCrisisRoute(params);

            await new Promise(r => setTimeout(r, 50));

            expect(mockCreateEscalation).toHaveBeenCalledWith(
                expect.objectContaining({ riskLevel: 'urgent' }),
            );
        });

        it('stream data 附加危机状态元数据', async () => {
            const params = createBaseParams();
            await handleCrisisRoute(params);

            expect(params.data.append).toHaveBeenCalledWith(
                expect.objectContaining({
                    routeType: 'crisis',
                    state: 'in_crisis',
                }),
            );
        });
    });

    // ===== 危机脱离 =====

    describe('危机脱离（deescalation）', () => {
        it('已脱离危机 — 走 support 路由', async () => {
            mockDeescalation.mockResolvedValue({
                isSafe: true,
                confidence: 'high',
                reason: '用户有具体的后续计划',
            });

            const params = createBaseParams({
                state: 'in_crisis',
                safetyData: { label: 'normal', score: 1, constraints: [] },
            });
            await handleCrisisRoute(params);

            expect(mockStreamSupport).toHaveBeenCalledTimes(1);
            expect(mockStreamCrisis).not.toHaveBeenCalled();
        });

        it('未脱离危机（"我没事了"敷衍）— 仍走 crisis', async () => {
            mockDeescalation.mockResolvedValue({
                isSafe: false,
                confidence: 'medium',
                reason: '仅有简单否认，缺乏具体好转证据',
            });

            const params = createBaseParams({
                state: 'in_crisis',
                message: '我没事了',
                safetyData: { label: 'normal', score: 1, constraints: [] },
            });
            await handleCrisisRoute(params);

            expect(mockStreamCrisis).toHaveBeenCalledTimes(1);
            expect(mockStreamSupport).not.toHaveBeenCalled();
        });

        it('脱离评估 — 仅在 state=in_crisis 且 label=normal 时触发', async () => {
            // state 不是 in_crisis → 不评估脱离
            const params = createBaseParams({
                state: undefined,
                safetyData: { label: 'normal', score: 0, constraints: [] },
            });
            await handleCrisisRoute(params);

            expect(mockDeescalation).not.toHaveBeenCalled();
        });

        it('脱离后 — stream data 标记为 support', async () => {
            mockDeescalation.mockResolvedValue({
                isSafe: true,
                confidence: 'high',
                reason: '情绪好转',
            });

            const params = createBaseParams({
                state: 'in_crisis',
                safetyData: { label: 'normal', score: 0, constraints: [] },
            });
            await handleCrisisRoute(params);

            expect(params.data.append).toHaveBeenCalledWith(
                expect.objectContaining({
                    routeType: 'support',
                    state: 'normal',
                }),
            );
        });
    });

    // ===== 容错 =====

    describe('容错', () => {
        it('无 userId/sessionId — 不创建升级记录', async () => {
            const params = createBaseParams({
                userId: undefined,
                sessionId: undefined,
            });
            await handleCrisisRoute(params);

            expect(mockCreateEscalation).not.toHaveBeenCalled();
        });

        it('升级记录创建失败 — 不影响主流程', async () => {
            mockCreateEscalation.mockRejectedValue(new Error('DB error'));

            const params = createBaseParams();
            const response = await handleCrisisRoute(params);

            // 主流程仍正常返回
            expect(response).toBeInstanceOf(Response);
            expect(mockStreamCrisis).toHaveBeenCalled();
        });
    });

    // ===== 不应走 crisis 路由（双向测试） =====

    describe('边界情况', () => {
        it('safetyData.label=normal 且 state 非 in_crisis — 不做脱离评估', async () => {
            const params = createBaseParams({
                safetyData: { label: 'normal', score: 0, constraints: [] },
                state: 'normal',
            });
            await handleCrisisRoute(params);

            expect(mockDeescalation).not.toHaveBeenCalled();
            // 但仍然会走 crisis 流程（因为调用方已经路由到了 handleCrisisRoute）
            expect(mockStreamCrisis).toHaveBeenCalled();
        });
    });
});
