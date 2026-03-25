/**
 * Sprint 2: Bad Case 自动采集器
 * 低分/异常对话自动回流为评测数据集
 */

import { getConversationWithMessages, findPendingStuckLoop } from './data-bridge';
import { writeAutoCase } from './db-writer';
import { logEvent } from '@/lib/observability/trace-context';

export interface BackflowTrigger {
    conversationId: string;
    overallScore: number;
    overallGrade: string;
    issues: string[];
}

/**
 * 检查是否触发自动回流，并执行采集
 */
export async function checkAndIngest(trigger: BackflowTrigger): Promise<boolean> {
    const shouldIngest =
        trigger.overallScore <= 2 || // 低分
        trigger.overallGrade === 'F'; // 最低评级

    if (!shouldIngest) return false;

    try {
        // 查询完整对话
        const conversation = await getConversationWithMessages(trigger.conversationId);

        if (!conversation || conversation.messages.length < 2) return false;

        // 构建对话 JSON
        const dialog = conversation.messages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }));

        // 写入 SQLite eval_cases
        writeAutoCase({
            conversationId: trigger.conversationId,
            dialog,
            overallScore: trigger.overallScore,
            overallGrade: trigger.overallGrade,
            issues: trigger.issues,
        });

        // 记录 Langfuse 事件
        logEvent('auto_backflow', {
            conversationId: trigger.conversationId,
            score: trigger.overallScore,
            grade: trigger.overallGrade,
            issueCount: trigger.issues.length,
        });

        console.log(`[AutoIngest] 已回流对话 ${trigger.conversationId}（评分 ${trigger.overallScore}）`);
        return true;
    } catch (error) {
        console.error('[AutoIngest] 回流失败:', error);
        return false;
    }
}

/**
 * 检查 STUCK_LOOP 事件并回流
 */
export async function ingestStuckLoops(conversationId: string): Promise<boolean> {
    try {
        const event = await findPendingStuckLoop(conversationId);

        if (!event) return false;

        return checkAndIngest({
            conversationId,
            overallScore: 1,
            overallGrade: 'F',
            issues: [`STUCK_LOOP: ${event.summary}`],
        });
    } catch {
        return false;
    }
}
