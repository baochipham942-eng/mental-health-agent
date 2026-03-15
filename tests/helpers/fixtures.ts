/**
 * 共用测试数据工厂（V2）
 */
import type { MemoryTopic, ExtractedMemory, ConversationMessage } from '@/lib/memory/types';

/**
 * 创建对话消息列表
 */
export function createConversationMessages(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
): ConversationMessage[] {
    return messages.map(m => ({
        role: m.role,
        content: m.content,
    }));
}

/**
 * 创建提取的记忆
 */
export function createExtractedMemory(overrides: Partial<ExtractedMemory> = {}): ExtractedMemory {
    return {
        topic: 'emotional_pattern',
        content: '用户因工作压力感到焦虑',
        confidence: 0.8,
        ...overrides,
    };
}

/**
 * 常用测试 PII 数据
 */
export const PII_SAMPLES = {
    phone: '13812345678',
    phone2: '19912345678',
    idCard: '110101199001011234',
    idCardX: '11010119900101123X',
    email: 'test@example.com',
    bankCard: '6222021234567890123',
    qq: 'QQ: 12345678',
    wechat: '微信号: test_user',
    ip: '192.168.1.1',
};
