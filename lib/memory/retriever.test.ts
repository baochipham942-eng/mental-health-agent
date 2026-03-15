import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    retrieveMemories,
    retrieveRelevantMemories,
    getMemoriesByTopic,
    getRecentMemories,
    executeMemoryTool,
} from './retriever';

// Mock 依赖
vi.mock('@/lib/db/prisma', () => ({
    prisma: {
        userMemory: {
            findMany: vi.fn().mockResolvedValue([]),
            updateMany: vi.fn().mockResolvedValue({}),
        },
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('./forgetting-curve', () => ({
    calculateMemoryStrength: vi.fn().mockReturnValue(0.5),
    updateAfterAccess: vi.fn(),
}));

vi.mock('./embedding', () => ({
    generateEmbedding: vi.fn().mockResolvedValue(null),
    cosineSimilarity: vi.fn().mockReturnValue(0.8),
    hybridScore: vi.fn().mockReturnValue(0.7),
}));

import { prisma } from '@/lib/db/prisma';
import { generateEmbedding, cosineSimilarity, hybridScore } from './embedding';

const mockFindMany = vi.mocked(prisma.userMemory.findMany);
const mockUpdateMany = vi.mocked(prisma.userMemory.updateMany);
const mockQueryRaw = vi.mocked(prisma.$queryRawUnsafe);
const mockGenEmbed = vi.mocked(generateEmbedding);
const mockCosine = vi.mocked(cosineSimilarity);
const mockHybrid = vi.mocked(hybridScore);

const sampleMemories = [
    {
        id: 'm1', userId: 'user-1', topic: 'emotional_pattern',
        content: '用户经常在周一感到焦虑', confidence: 0.8,
        sourceConvId: 'conv-1', createdAt: new Date(), updatedAt: new Date(),
        accessedAt: new Date(), accessCount: 3, stabilityFactor: 1.2, memoryStrength: 0.7,
    },
    {
        id: 'm2', userId: 'user-1', topic: 'personal_context',
        content: '用户在互联网公司工作', confidence: 0.9,
        sourceConvId: 'conv-2', createdAt: new Date(), updatedAt: new Date(),
        accessedAt: new Date(), accessCount: 5, stabilityFactor: 1.5, memoryStrength: 0.9,
    },
];

describe('retrieveMemories', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindMany.mockResolvedValue(sampleMemories as any);
    });

    it('返回用户记忆列表', async () => {
        const result = await retrieveMemories('user-1');
        expect(result).toHaveLength(2);
        expect(result[0].topic).toBe('emotional_pattern');
    });

    it('按 topic 过滤', async () => {
        await retrieveMemories('user-1', { topics: ['emotional_pattern'] as any });
        const where = mockFindMany.mock.calls[0][0]?.where as any;
        expect(where.topic).toEqual({ in: ['emotional_pattern'] });
    });

    it('按 minConfidence 过滤', async () => {
        await retrieveMemories('user-1', { minConfidence: 0.7 });
        const where = mockFindMany.mock.calls[0][0]?.where as any;
        expect(where.confidence).toEqual({ gte: 0.7 });
    });

    it('limit 限制数量', async () => {
        await retrieveMemories('user-1', { limit: 5 });
        const take = mockFindMany.mock.calls[0][0]?.take;
        expect(take).toBe(5);
    });

    it('默认 limit=20, minConfidence=0.5', async () => {
        await retrieveMemories('user-1');
        const args = mockFindMany.mock.calls[0][0] as any;
        expect(args.take).toBe(20);
        expect(args.where.confidence).toEqual({ gte: 0.5 });
    });

    it('检索后更新 accessedAt', async () => {
        await retrieveMemories('user-1');
        expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { id: { in: ['m1', 'm2'] } },
            data: { accessedAt: expect.any(Date) },
        });
    });

    it('空结果 → 不更新 accessedAt', async () => {
        mockFindMany.mockResolvedValue([]);
        await retrieveMemories('user-1');
        expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it('updateMany 失败 → 不影响返回', async () => {
        mockUpdateMany.mockRejectedValue(new Error('update failed'));
        const result = await retrieveMemories('user-1');
        expect(result).toHaveLength(2); // 仍然正常返回
    });
});

describe('retrieveRelevantMemories', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindMany.mockResolvedValue(sampleMemories as any);
    });

    it('embedding 不可用 → 降级到关键词匹配', async () => {
        mockGenEmbed.mockResolvedValue(null);

        const result = await retrieveRelevantMemories('user-1', '焦虑');
        // 关键词 "焦虑" 匹配 m1
        expect(result.length).toBeGreaterThan(0);
    });

    it('embedding 可用 → 向量混合检索', async () => {
        const fakeEmbed = [0.1, 0.2, 0.3];
        mockGenEmbed.mockResolvedValue(fakeEmbed as any);
        mockQueryRaw.mockResolvedValue([
            { id: 'm1', embedding: '[0.1,0.2,0.3]' },
            { id: 'm2', embedding: '[0.4,0.5,0.6]' },
        ] as any);
        mockCosine.mockReturnValue(0.9);
        mockHybrid.mockReturnValue(0.85);

        const result = await retrieveRelevantMemories('user-1', '最近好焦虑');

        expect(mockGenEmbed).toHaveBeenCalledWith('最近好焦虑');
        expect(result.length).toBeGreaterThan(0);
    });

    it('向量检索异常 → 降级到关键词', async () => {
        mockGenEmbed.mockResolvedValue([0.1, 0.2] as any);
        mockQueryRaw.mockRejectedValue(new Error('pgvector error'));

        const result = await retrieveRelevantMemories('user-1', '工作压力');
        // 关键词 "工作" 匹配 m2
        expect(result.length).toBeGreaterThan(0);
    });

    it('无记忆 → 返回空数组', async () => {
        mockFindMany.mockResolvedValue([]);
        const result = await retrieveRelevantMemories('user-1', '随便什么');
        expect(result).toEqual([]);
    });

    it('无关键词匹配 → 返回前 5 条', async () => {
        mockGenEmbed.mockResolvedValue(null);
        // 消息全是停用词
        const result = await retrieveRelevantMemories('user-1', '的了是我你');
        expect(result.length).toBeLessThanOrEqual(5);
    });

    it('limit 参数生效', async () => {
        mockGenEmbed.mockResolvedValue(null);
        const result = await retrieveRelevantMemories('user-1', '焦虑', { limit: 1 });
        expect(result.length).toBeLessThanOrEqual(1);
    });
});

describe('getMemoriesByTopic / getRecentMemories', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindMany.mockResolvedValue(sampleMemories as any);
    });

    it('getMemoriesByTopic 按 topic 过滤', async () => {
        await getMemoriesByTopic('user-1', 'emotional_pattern' as any);
        const where = mockFindMany.mock.calls[0][0]?.where as any;
        expect(where.topic).toEqual({ in: ['emotional_pattern'] });
    });

    it('getRecentMemories 默认 limit=10', async () => {
        await getRecentMemories('user-1');
        const take = mockFindMany.mock.calls[0][0]?.take;
        expect(take).toBe(10);
    });
});

describe('executeMemoryTool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindMany.mockResolvedValue(sampleMemories as any);
    });

    it('指定 topic → 按 topic 检索', async () => {
        const result = await executeMemoryTool('user-1', { topic: 'emotional_pattern' as any });
        expect(result).toContain('找到');
        expect(result).toContain('emotional_pattern');
    });

    it('指定 query → 语义检索', async () => {
        mockGenEmbed.mockResolvedValue(null);
        const result = await executeMemoryTool('user-1', { query: '焦虑' });
        expect(result).toContain('找到');
    });

    it('无参数 → 返回最近记忆', async () => {
        const result = await executeMemoryTool('user-1', {});
        expect(result).toContain('找到');
    });

    it('无记忆 → 友好提示', async () => {
        mockFindMany.mockResolvedValue([]);
        const result = await executeMemoryTool('user-1', { topic: 'crisis_history' as any });
        expect(result).toContain('没有找到');
    });
});
