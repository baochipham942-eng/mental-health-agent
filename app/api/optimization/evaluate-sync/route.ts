import { NextRequest, NextResponse } from 'next/server';
import { evaluateAndSaveConversation } from '@/lib/actions/evaluation';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';
import { runWithTrace, getCurrentTrace } from '@/lib/observability/trace-context';
import { updateTrace } from '@/lib/observability/langfuse';

export const dynamic = 'force-dynamic';

// 设置较长的超时时间
export const maxDuration = 60; // 60秒

/**
 * 同步评估会话（等待所有评估完成后返回）
 */
export async function POST(request: NextRequest) {
    return runWithTrace('evaluate-sync', {}, async () => {
    try {
        // 验证管理员权限
        const { admin: isAdmin } = await checkAdmin();

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { conversationIds } = body as { conversationIds: string[] };

        if (!conversationIds || conversationIds.length === 0) {
            return NextResponse.json({
                error: 'No conversations specified',
            }, { status: 400 });
        }

        console.log(`[Evaluate Sync] Starting evaluation for ${conversationIds.length} conversations...`);

        let success = 0;
        let failed = 0;
        const results: any[] = [];

        // 逐个同步评估
        for (const convId of conversationIds) {
            try {
                console.log(`[Evaluate Sync] Processing ${convId}...`);
                const evaluation = await evaluateAndSaveConversation(convId);

                if (evaluation) {
                    success++;
                    results.push({
                        id: evaluation.id,
                        conversationId: convId,
                        overallGrade: evaluation.overallGrade,
                        overallScore: evaluation.overallScore,
                    });
                    console.log(`[Evaluate Sync] Completed ${convId}: ${evaluation.overallGrade}`);
                } else {
                    failed++;
                    console.log(`[Evaluate Sync] Failed ${convId}: no result`);
                }
            } catch (error) {
                failed++;
                console.error(`[Evaluate Sync] Error processing ${convId}:`, error);
            }
        }

        console.log(`[Evaluate Sync] Done. Success: ${success}, Failed: ${failed}`);

        // Langfuse trace metadata
        const reqTrace = getCurrentTrace()?.trace;
        if (reqTrace) {
            updateTrace(reqTrace, {
                metadata: {
                    conversationCount: conversationIds.length,
                    successCount: success,
                    failedCount: failed,
                },
            });
        }

        return NextResponse.json({
            success,
            failed,
            total: conversationIds.length,
            results,
        });

    } catch (error) {
        console.error('[Evaluate Sync] Failed:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Evaluation failed',
        }, { status: 500 });
    }
    }); // end runWithTrace
}
