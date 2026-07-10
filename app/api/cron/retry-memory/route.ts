/**
 * Cron: 重试失败的记忆提取（V2 流程）
 * 每次最多处理 10 条，最多重试 3 次
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    findPendingExtractionLogs,
    updateExtractionLog,
    getConversationUserId,
} from '@/lib/memory/data-bridge';
import { memoryCandidateService, profileMemoryMergeService } from '@/lib/memory';

export const dynamic = 'force-dynamic';

const MAX_RETRIES = 3;
const BATCH_SIZE = 10;

export async function GET(request: NextRequest) {
    // CRON_SECRET 未配置时 'Bearer undefined' 字面量可过校验，必须 fail-closed
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const pendingRetries = await findPendingExtractionLogs(MAX_RETRIES, BATCH_SIZE);

        if (pendingRetries.length === 0) {
            return NextResponse.json({ message: 'No pending retries', processed: 0 });
        }

        let successCount = 0;
        let failCount = 0;

        for (const log of pendingRetries) {
            try {
                // V2 提取流程：提取候选记忆 + 合并到 ProfileMemory
                const extracted = await memoryCandidateService.extractAndSave(log.conversationId);

                // 获取会话对应的 userId
                const conversationUserId = await getConversationUserId(log.conversationId);
                if (conversationUserId && extracted.length > 0) {
                    await profileMemoryMergeService.mergeExtractedMemories(
                        conversationUserId,
                        log.conversationId,
                        extracted,
                    );
                }

                await updateExtractionLog(log.id, {
                    status: 'success',
                    retryCount: log.retryCount + 1,
                    error: null,
                });
                successCount++;
            } catch (e: any) {
                const newRetryCount = log.retryCount + 1;
                await updateExtractionLog(log.id, {
                    status: newRetryCount >= MAX_RETRIES ? 'failed' : 'pending_retry',
                    retryCount: newRetryCount,
                    error: e.message?.slice(0, 500),
                });
                failCount++;
            }
        }

        return NextResponse.json({
            message: '重试批次完成',
            processed: pendingRetries.length,
            success: successCount,
            failed: failCount,
        });
    } catch (e: any) {
        console.error('[CronRetryMemory] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
