import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractMemoriesFromMessages, extractMemoriesFromConversations } from './extractor';
import { createConversationMessages } from '@/tests/helpers/fixtures';

vi.mock('@/lib/ai/deepseek', () => ({
    chatStructuredCompletion: vi.fn(),
    chatCompletion: vi.fn(),
}));

import { chatStructuredCompletion } from '@/lib/ai/deepseek';
const mockChatStructured = vi.mocked(chatStructuredCompletion);

describe('extractMemoriesFromMessages', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('全是 assistant 消息(无 user 消息) → 返回 []', async () => {
        const messages = createConversationMessages([
            { role: 'assistant', content: '你好，我是心理咨询师' },
            { role: 'assistant', content: '请告诉我你的感受' },
        ]);
        const result = await extractMemoriesFromMessages(messages);
        expect(result).toEqual([]);
        expect(mockChatStructured).not.toHaveBeenCalled();
    });

    it('正常提取 → 内容通过 redactPII 脱敏', async () => {
        mockChatStructured.mockResolvedValue({
            memories: [{
                topic: 'emotional_pattern',
                content: '用户手机号 13812345678 感到焦虑',
                confidence: 0.8,
            }],
        } as any);
        const messages = createConversationMessages([
            { role: 'user', content: '我最近很焦虑' },
            { role: 'assistant', content: '能告诉我更多吗' },
        ]);
        const result = await extractMemoriesFromMessages(messages);
        expect(result).toHaveLength(1);
        // Phone number should be redacted by redactPII
        expect(result![0].content).toContain('[手机号已脱敏]');
        expect(result![0].content).not.toContain('13812345678');
    });

    it('confidence 被限制在 [0.5, 1] 范围内', async () => {
        mockChatStructured.mockResolvedValue({
            memories: [
                { topic: 'emotional_pattern', content: '低置信度', confidence: 0.2 },
                { topic: 'emotional_pattern', content: '高置信度', confidence: 1.5 },
            ],
        } as any);
        const messages = createConversationMessages([
            { role: 'user', content: '测试' },
        ]);
        const result = await extractMemoriesFromMessages(messages);
        expect(result![0].confidence).toBe(0.5);
        expect(result![1].confidence).toBe(1);
    });

    it('API 失败 → 返回 null 不抛异常（区分「失败」与「真无记忆」）', async () => {
        mockChatStructured.mockRejectedValue(new Error('API timeout'));
        const messages = createConversationMessages([
            { role: 'user', content: '测试' },
        ]);
        const result = await extractMemoriesFromMessages(messages);
        expect(result).toBeNull();
    });
});

describe('extractMemoriesFromConversations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('一个对话失败 → 其他对话仍然正常', async () => {
        let callCount = 0;
        mockChatStructured.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                throw new Error('API error');
            }
            return {
                memories: [{ topic: 'emotional_pattern', content: '正常提取', confidence: 0.8 }],
            } as any;
        });
        const conversations = [
            { id: 'conv-1', messages: createConversationMessages([{ role: 'user', content: 'a' }]) },
            { id: 'conv-2', messages: createConversationMessages([{ role: 'user', content: 'b' }]) },
        ];
        const results = await extractMemoriesFromConversations(conversations);
        expect(results.get('conv-1')).toEqual([]);
        expect(results.get('conv-2')!.length).toBe(1);
    });

    it('批量提取返回 Map, key 与输入 ID 对应', async () => {
        mockChatStructured.mockResolvedValue({
            memories: [{ topic: 'emotional_pattern', content: '内容', confidence: 0.8 }],
        } as any);
        const conversations = [
            { id: 'a', messages: createConversationMessages([{ role: 'user', content: 'x' }]) },
            { id: 'b', messages: createConversationMessages([{ role: 'user', content: 'y' }]) },
        ];
        const results = await extractMemoriesFromConversations(conversations);
        expect(results).toBeInstanceOf(Map);
        expect(results.has('a')).toBe(true);
        expect(results.has('b')).toBe(true);
        expect(results.size).toBe(2);
    });
});
