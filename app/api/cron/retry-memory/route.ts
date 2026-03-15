/**
 * Cron: 重试失败的记忆提取（V2 流程）
 * 每次最多处理 10 条，最多重试 3 次
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { memoryCandidateService, profileMemoryMergeService } from '@/lib/memory';

export const dynamic = 'force-dynamic';

const MAX_RETRIES = 3;
const BATCH_SIZE = 10;

export async function GET(request: NextRequest) {
    // 简单的 cron 鉴权
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const pendingRetries = await prisma.memoryExtractionLog.findMany({
            where: {
                status: { in: ['failed', 'pending_retry'] },
                retryCount: { lt: MAX_RETRIES },
            },
            orderBy: { createdAt: 'asc' },
            take: BATCH_SIZE,
        });

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
                const conversation = await prisma.conversation.findUnique({
                    where: { id: log.conversationId },
                    select: { userId: true },
                });
                if (conversation?.userId && extracted.length > 0) {
                    await profileMemoryMergeService.mergeExtractedMemories(
                        conversation.userId,
                        log.conversationId,
                        extracted,
                    );
                }

                await prisma.memoryExtractionLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'success',
                        retryCount: log.retryCount + 1,
                        error: null,
                    },
                });
                successCount++;
            } catch (e: any) {
                const newRetryCount = log.retryCount + 1;
                await prisma.memoryExtractionLog.update({
                    where: { id: log.id },
                    data: {
                        status: newRetryCount >= MAX_RETRIES ? 'failed' : 'pending_retry',
                        retryCount: newRetryCount,
                        error: e.message?.slice(0, 500),
                    },
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
