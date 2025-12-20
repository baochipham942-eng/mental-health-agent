/**
 * 会话快照服务
 * 
 * 将会话保存为测试用例，用于：
 * - 黄金数据集构建
 * - 回归测试
 * - 负面反馈自动收集
 */
import { prisma } from '@/lib/db/prisma';
import { redactPII } from '@/lib/memory/redact';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 会话快照结构
 */
export interface ConversationSnapshot {
    id: string;
    version: '1.0';
    createdAt: string;
    messages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    expectedOutcome?: {
        emotionLabel?: string;
        emotionScoreRange?: [number, number];
        crisisDetected?: boolean;
        routeType?: 'crisis' | 'support' | 'assessment';
    };
    tags: string[];
    source: 'manual' | 'auto_negative_feedback' | 'auto_crisis';
}

// 黄金数据集目录
const GOLDEN_DIR = path.join(process.cwd(), 'tests', 'golden');

/**
 * 将当前会话保存为测试用例快照
 * 
 * @param conversationId 会话ID
 * @param expectedOutcome 期望结果（可选）
 * @param tags 标签
 * @param source 来源
 */
export async function saveConversationAsSnapshot(
    conversationId: string,
    expectedOutcome?: ConversationSnapshot['expectedOutcome'],
    tags: string[] = [],
    source: ConversationSnapshot['source'] = 'manual'
): Promise<ConversationSnapshot> {
    // 1. 从数据库读取消息
    const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        select: { role: true, content: true },
    });

    if (messages.length === 0) {
        throw new Error('Conversation has no messages');
    }

    // 2. 过滤并脱敏处理
    const redactedMessages = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: redactPII(m.content),
        }));

    // 3. 构造快照
    const snapshot: ConversationSnapshot = {
        id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        version: '1.0',
        createdAt: new Date().toISOString(),
        messages: redactedMessages,
        expectedOutcome,
        tags,
        source,
    };

    // 4. 确保目录存在
    await fs.mkdir(GOLDEN_DIR, { recursive: true });

    // 5. 保存快照文件
    const filePath = path.join(GOLDEN_DIR, `${snapshot.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));

    // 6. 更新索引
    await updateSnapshotIndex(snapshot);

    return snapshot;
}

/**
 * 更新快照索引文件
 */
async function updateSnapshotIndex(newSnapshot: ConversationSnapshot) {
    const indexPath = path.join(GOLDEN_DIR, 'index.json');

    let index: Array<{ id: string; tags: string[]; createdAt: string; source: string }> = [];

    try {
        const existing = await fs.readFile(indexPath, 'utf-8');
        index = JSON.parse(existing);
    } catch {
        // 文件不存在，使用空数组
    }

    index.push({
        id: newSnapshot.id,
        tags: newSnapshot.tags,
        createdAt: newSnapshot.createdAt,
        source: newSnapshot.source,
    });

    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
}

/**
 * 列出所有快照
 */
export async function listSnapshots(): Promise<Array<{
    id: string;
    tags: string[];
    createdAt: string;
    source: string;
}>> {
    const indexPath = path.join(GOLDEN_DIR, 'index.json');

    try {
        const content = await fs.readFile(indexPath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
}

/**
 * 读取单个快照
 */
export async function loadSnapshot(snapshotId: string): Promise<ConversationSnapshot | null> {
    const filePath = path.join(GOLDEN_DIR, `${snapshotId}.json`);

    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

/**
 * 删除快照
 */
export async function deleteSnapshot(snapshotId: string): Promise<boolean> {
    const filePath = path.join(GOLDEN_DIR, `${snapshotId}.json`);
    const indexPath = path.join(GOLDEN_DIR, 'index.json');

    try {
        // 删除快照文件
        await fs.unlink(filePath);

        // 更新索引
        const index = await listSnapshots();
        const updated = index.filter(s => s.id !== snapshotId);
        await fs.writeFile(indexPath, JSON.stringify(updated, null, 2));

        return true;
    } catch {
        return false;
    }
}
