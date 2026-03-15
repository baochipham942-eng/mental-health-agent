import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryManager } from './manager';

// Mock 依赖
vi.mock('@/lib/db/prisma', () => ({
    prisma: {
        conversation: { findUnique: vi.fn() },
        userMemory: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({ id: 'mem-1' }),
            update: vi.fn().mockResolvedValue({}),
            delete: vi.fn().mockResolvedValue({}),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            findUnique: vi.fn(),
        },
        memoryExtractionLog: { create: vi.fn().mockResolvedValue({}) },
    },
}));

vi.mock('./extractor', () => ({
    extractMemoriesFromMessages: vi.fn().mockResolvedValue([]),
}));

vi.mock('./consolidator', () => ({
    consolidateMemory: vi.fn().mockResolvedValue({ action: 'create' }),
}));

vi.mock('./retriever', () => ({
    retrieveRelevantMemories: vi.fn().mockResolvedValue([]),
    retrieveMemories: vi.fn().mockResolvedValue([]),
}));

vi.mock('./prompts', () => ({
    formatMemoriesForInjection: vi.fn().mockReturnValue(''),
}));

vi.mock('./redact', () => ({
    redactPII: vi.fn((text: string) => text),
}));

import { prisma } from '@/lib/db/prisma';
import { extractMemoriesFromMessages } from './extractor';
import { consolidateMemory } from './consolidator';
import { retrieveRelevantMemories } from './retriever';
import { formatMemoriesForInjection } from './prompts';
import { redactPII } from './redact';

const mockConvFindUnique = vi.mocked(prisma.conversation.findUnique);
const mockMemoryFindMany = vi.mocked(prisma.userMemory.findMany);
const mockMemoryCreate = vi.mocked(prisma.userMemory.create);
const mockMemoryUpdate = vi.mocked(prisma.userMemory.update);
const mockMemoryDelete = vi.mocked(prisma.userMemory.delete);
const mockMemoryDeleteMany = vi.mocked(prisma.userMemory.deleteMany);
const mockMemoryFindUnique = vi.mocked(prisma.userMemory.findUnique);
const mockExtract = vi.mocked(extractMemoriesFromMessages);
const mockConsolidate = vi.mocked(consolidateMemory);
const mockRetrieveRelevant = vi.mocked(retrieveRelevantMemories);
const mockFormat = vi.mocked(formatMemoriesForInjection);
const mockRedact = vi.mocked(redactPII);

describe('MemoryManager', () => {
    let manager: MemoryManager;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new MemoryManager();
    });

    // ===== processConversation =====

    describe('processConversation', () => {
        it('对话不存在 → 跳过', async () => {
            mockConvFindUnique.mockResolvedValue(null);
            await manager.processConversation('conv-404');
            expect(mockExtract).not.toHaveBeenCalled();
        });

        it('消息少于 2 条 → 跳过', async () => {
            mockConvFindUnique.mockResolvedValue({
                id: 'conv-1', userId: 'user-1',
                messages: [{ role: 'user', content: '你好' }],
            } as any);
            await manager.processConversation('conv-1');
            expect(mockExtract).not.toHaveBeenCalled();
        });

        it('无有效记忆提取 → 不创建', async () => {
            mockConvFindUnique.mockResolvedValue({
                id: 'conv-1', userId: 'user-1',
                messages: [
                    { role: 'user', content: '你好' },
                    { role: 'assistant', content: '你好呀' },
                ],
            } as any);
            mockExtract.mockResolvedValue([]);

            await manager.processConversation('conv-1');
            expect(mockMemoryCreate).not.toHaveBeenCalled();
        });

        it('提取到新记忆 → 创建（PII 脱敏）', async () => {
            mockConvFindUnique.mockResolvedValue({
                id: 'conv-1', userId: 'user-1',
                messages: [
                    { role: 'user', content: '我叫张三，手机 13800001111' },
                    { role: 'assistant', content: '好的' },
                ],
            } as any);
            mockExtract.mockResolvedValue([
                { topic: 'personal_context', content: '用户叫张三', confidence: 0.8 },
            ] as any);
            mockMemoryFindMany.mockResolvedValue([]);
            mockConsolidate.mockResolvedValue({ action: 'create' });

            await manager.processConversation('conv-1');

            expect(mockRedact).toHaveBeenCalled();
            expect(mockMemoryCreate).toHaveBeenCalledTimes(1);
            expect(mockMemoryCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    userId: 'user-1',
                    topic: 'personal_context',
                    sourceConvId: 'conv-1',
                }),
            });
        });

        it('合并已有记忆 → 更新', async () => {
            mockConvFindUnique.mockResolvedValue({
                id: 'conv-2', userId: 'user-1',
                messages: [
                    { role: 'user', content: '最近还是很焦虑' },
                    { role: 'assistant', content: '理解' },
                ],
            } as any);
            mockExtract.mockResolvedValue([
                { topic: 'emotional_pattern', content: '持续焦虑', confidence: 0.9 },
            ] as any);
            mockMemoryFindMany.mockResolvedValue([
                { id: 'old-mem', topic: 'emotional_pattern', content: '偶尔焦虑', confidence: 0.7, userId: 'user-1' },
            ] as any);
            mockConsolidate.mockResolvedValue({
                action: 'update',
                targetMemoryId: 'old-mem',
                mergedContent: '持续焦虑（从偶尔升级）',
            });

            await manager.processConversation('conv-2');

            expect(mockMemoryUpdate).toHaveBeenCalledTimes(1);
            expect(mockMemoryUpdate).toHaveBeenCalledWith({
                where: { id: 'old-mem' },
                data: expect.objectContaining({
                    confidence: 0.9, // max(0.9, 0.7)
                }),
            });
        });

        it('删除过时记忆', async () => {
            mockConvFindUnique.mockResolvedValue({
                id: 'conv-3', userId: 'user-1',
                messages: [
                    { role: 'user', content: '我已经搬到北京了' },
                    { role: 'assistant', content: '好的' },
                ],
            } as any);
            mockExtract.mockResolvedValue([
                { topic: 'personal_context', content: '在北京', confidence: 0.9 },
            ] as any);
            mockMemoryFindMany.mockResolvedValue([
                { id: 'old-loc', topic: 'personal_context', content: '在上海', confidence: 0.8, userId: 'user-1' },
            ] as any);
            mockConsolidate.mockResolvedValue({ action: 'delete', targetMemoryId: 'old-loc' });

            await manager.processConversation('conv-3');

            expect(mockMemoryDelete).toHaveBeenCalledWith({ where: { id: 'old-loc' } });
        });

        it('DB 异常 → 不崩溃（记录日志）', async () => {
            mockConvFindUnique.mockRejectedValue(new Error('DB error'));
            // 不应抛出
            await manager.processConversation('conv-error');
        });
    });

    // ===== getMemoriesForContext =====

    describe('getMemoriesForContext', () => {
        it('返回记忆和格式化上下文', async () => {
            const mockMemories = [
                { id: 'm1', topic: 'personal_context', content: '用户在北京' },
            ];
            mockRetrieveRelevant.mockResolvedValue(mockMemories as any);
            mockFormat.mockReturnValue('## 用户画像\n- 用户在北京');

            const result = await manager.getMemoriesForContext('user-1', '今天天气怎么样');

            expect(result.memories).toEqual(mockMemories);
            expect(result.contextString).toContain('用户画像');
            expect(mockRetrieveRelevant).toHaveBeenCalledWith('user-1', '今天天气怎么样', {
                limit: 10,
                minConfidence: 0.6,
            });
        });

        it('无记忆 → 空结果', async () => {
            mockRetrieveRelevant.mockResolvedValue([]);
            mockFormat.mockReturnValue('');

            const result = await manager.getMemoriesForContext('user-new', '你好');

            expect(result.memories).toEqual([]);
            expect(result.contextString).toBe('');
        });
    });

    // ===== forgetMemory =====

    describe('forgetMemory', () => {
        it('正确的用户 → 删除成功', async () => {
            mockMemoryFindUnique.mockResolvedValue({ userId: 'user-1' } as any);
            mockMemoryDelete.mockResolvedValue({} as any);

            const result = await manager.forgetMemory('mem-1', 'user-1');
            expect(result).toBe(true);
            expect(mockMemoryDelete).toHaveBeenCalledWith({ where: { id: 'mem-1' } });
        });

        it('不同用户 → 拒绝删除', async () => {
            mockMemoryFindUnique.mockResolvedValue({ userId: 'user-other' } as any);

            const result = await manager.forgetMemory('mem-1', 'user-1');
            expect(result).toBe(false);
            expect(mockMemoryDelete).not.toHaveBeenCalled();
        });

        it('记忆不存在 → 返回 false', async () => {
            mockMemoryFindUnique.mockResolvedValue(null);
            const result = await manager.forgetMemory('mem-404', 'user-1');
            expect(result).toBe(false);
        });

        it('DB 错误 → 返回 false', async () => {
            mockMemoryFindUnique.mockRejectedValue(new Error('DB error'));
            const result = await manager.forgetMemory('mem-1', 'user-1');
            expect(result).toBe(false);
        });
    });

    // ===== pruneStaleMemories =====

    describe('pruneStaleMemories', () => {
        it('删除过期记忆 → 返回数量', async () => {
            mockMemoryDeleteMany.mockResolvedValue({ count: 3 } as any);

            const count = await manager.pruneStaleMemories('user-1');
            expect(count).toBe(3);
            expect(mockMemoryDeleteMany).toHaveBeenCalledWith({
                where: expect.objectContaining({ userId: 'user-1' }),
            });
        });

        it('自定义参数', async () => {
            mockMemoryDeleteMany.mockResolvedValue({ count: 0 } as any);

            await manager.pruneStaleMemories('user-1', { maxAge: 30, minConfidence: 0.8 });

            const callArgs = mockMemoryDeleteMany.mock.calls[0][0] as any;
            expect(callArgs.where.OR).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ confidence: { lt: 0.8 } }),
                ]),
            );
        });

        it('DB 错误 → 返回 0', async () => {
            mockMemoryDeleteMany.mockRejectedValue(new Error('DB error'));
            const count = await manager.pruneStaleMemories('user-1');
            expect(count).toBe(0);
        });
    });
});
