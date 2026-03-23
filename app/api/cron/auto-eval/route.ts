/**
 * Cron: 自动评测最近未评估的对话
 * 频率建议：每 6 小时
 * 使用 fire-and-forget 模式绕 Vercel 10s 限制
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { evaluateAndSaveConversation } from '@/lib/actions/evaluation';

export const dynamic = 'force-dynamic';

const HOURS_LOOKBACK = 6;
const MAX_BATCH_SIZE = 20;

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - HOURS_LOOKBACK);

        // 查询最近更新且未评估的对话（至少有 2 条消息）
        const unevaluated = await prisma.conversation.findMany({
            where: {
                updatedAt: { gte: cutoff },
                evaluation: null, // 无 ConversationEvaluation 记录
                messages: { some: {} }, // 至少有消息
            },
            select: {
                id: true,
                _count: { select: { messages: true } },
            },
            take: MAX_BATCH_SIZE,
            orderBy: { updatedAt: 'desc' },
        });

        // 过滤掉消息不足 2 条的
        const candidates = unevaluated.filter(c => c._count.messages >= 2);

        if (candidates.length === 0) {
            return NextResponse.json({
                message: '没有需要评估的对话',
                evaluated: 0,
            });
        }

        // 立即为每条对话创建占位记录
        const created: string[] = [];
        for (const conv of candidates) {
            try {
                await prisma.conversationEvaluation.create({
                    data: {
                        conversationId: conv.id,
                        userId: '', // 占位，evaluateAndSaveConversation 会更新
                        legalScore: 0,
                        legalIssues: [],
                        ethicalScore: 0,
                        ethicalIssues: [],
                        professionalScore: 0,
                        professionalIssues: [],
                        uxScore: 0,
                        uxIssues: [],
                        overallScore: 0,
                        overallGrade: 'EVALUATING',
                        improvements: [],
                        evalSource: 'auto_cron',
                    },
                });
                created.push(conv.id);
            } catch {
                // 可能已有记录，跳过
            }
        }

        // Fire-and-forget：后台异步执行真实评估
        (async () => {
            for (const convId of created) {
                try {
                    console.log(`[AutoEval:BG] 评估 ${convId}...`);
                    const result = await evaluateAndSaveConversation(convId);

                    // 标记 evalSource
                    if (result) {
                        await prisma.conversationEvaluation.update({
                            where: { conversationId: convId },
                            data: { evalSource: 'auto_cron' },
                        });
                    }
                    console.log(`[AutoEval:BG] ${convId}: ${result ? '成功' : '跳过'}`);
                } catch (error) {
                    console.error(`[AutoEval:BG] ${convId} 失败:`, error);
                    try {
                        await prisma.conversationEvaluation.update({
                            where: { conversationId: convId },
                            data: { overallGrade: 'FAILED' },
                        });
                    } catch {}
                }
            }
            console.log(`[AutoEval:BG] 全部完成，共 ${created.length} 条`);
        })().catch(err => {
            console.error('[AutoEval:BG] 后台任务异常:', err);
        });

        return NextResponse.json({
            message: `已启动自动评估`,
            total: created.length,
            conversationIds: created,
        });
    } catch (e: any) {
        console.error('[AutoEval] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
