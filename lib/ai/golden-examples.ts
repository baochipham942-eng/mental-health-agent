/**
 * Golden Examples Loader
 * 
 * 从数据库加载已审批的黄金样本，格式化为 Few-Shot 示例字符串
 */
import { prisma } from '@/lib/db/prisma';

export interface GoldenExample {
    id: string;
    userMessage: string;
    assistantMessage: string;
    userReason?: string | null;
}

/**
 * 加载最新的活跃黄金样本
 */
export async function loadActiveGoldenExamples(limit: number = 3): Promise<GoldenExample[]> {
    try {
        const examples = await prisma.goldenExample.findMany({
            where: { status: 'ACTIVE' },
            orderBy: { approvedAt: 'desc' },
            take: limit,
            select: {
                id: true,
                userMessage: true,
                assistantMessage: true,
                userReason: true,
            }
        });

        return examples;
    } catch (error) {
        console.error('[GoldenExamples] Failed to load:', error);
        return [];
    }
}

/**
 * 格式化黄金样本为 Few-Shot Prompt 片段
 */
export function formatGoldenExamplesForPrompt(examples: GoldenExample[]): string {
    if (examples.length === 0) return '';

    const formattedExamples = examples.map((ex, i) => {
        const parts = [`### 示例 ${i + 1}`];
        if (ex.userMessage) {
            parts.push(`**用户**: ${ex.userMessage}`);
        }
        parts.push(`**AI**: ${ex.assistantMessage}`);
        if (ex.userReason) {
            parts.push(`_（用户评价：${ex.userReason}）_`);
        }
        return parts.join('\n');
    }).join('\n\n');

    return `
## 优秀回复示例
以下是经过用户认可的高质量回复，请参考其语气和风格：

${formattedExamples}
`;
}

/**
 * 更新样本使用统计
 */
export async function incrementUsageCount(exampleIds: string[]): Promise<void> {
    if (exampleIds.length === 0) return;

    try {
        await prisma.goldenExample.updateMany({
            where: { id: { in: exampleIds } },
            data: {
                usageCount: { increment: 1 },
                lastUsedAt: new Date(),
            }
        });
    } catch (error) {
        console.error('[GoldenExamples] Failed to update usage count:', error);
    }
}
