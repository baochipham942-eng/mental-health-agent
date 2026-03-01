/**
 * 共用测试数据工厂
 */
import type { Memory, MemoryTopic, ExtractedMemory, ConversationMessage } from '@/lib/memory/types';

/**
 * 创建一个 Memory 对象（用于遗忘曲线等测试）
 */
export function createMemory(overrides: Partial<Memory> = {}): Memory {
    return {
        id: 'mem-test-1',
        userId: 'user-test-1',
        topic: 'emotional_pattern' as MemoryTopic,
        content: '用户经常因为工作压力感到焦虑',
        confidence: 0.8,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        accessedAt: new Date('2024-01-01'),
        accessCount: 1,
        stabilityFactor: 1.0,
        memoryStrength: 1.0,
        ...overrides,
    };
}

/**
 * 创建永久记忆（personal_context）
 */
export function createPermanentMemory(overrides: Partial<Memory> = {}): Memory {
    return createMemory({
        topic: 'personal_context',
        content: '用户有一个5岁的女儿',
        ...overrides,
    });
}

/**
 * 创建慢衰减记忆（therapy_progress）
 */
export function createSlowDecayMemory(overrides: Partial<Memory> = {}): Memory {
    return createMemory({
        topic: 'therapy_progress',
        content: '用户的焦虑症状有所改善',
        ...overrides,
    });
}

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
