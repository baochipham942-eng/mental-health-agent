/**
 * Cron: 自动评测最近未评估的对话
 * 频率建议：每 6 小时
 * 使用 fire-and-forget 模式绕 Vercel 10s 限制
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    findUnevaluatedConversations,
    createEvaluationPlaceholder,
    updateEvalSource,
    getLastAssistantMessage,
    getLastUserMessage,
    markEvaluationFailed,
} from '@/lib/eval/data-bridge';
import { evaluateAndSaveConversation } from '@/lib/actions/evaluation';
import { evaluateTrace } from '@/lib/eval/trace';
import { writeTraceEval } from '@/lib/eval/trace/db';
import { DEEPSEEK_MODEL } from '@/lib/ai/deepseek';

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
        const unevaluated = await findUnevaluatedConversations(cutoff, MAX_BATCH_SIZE);

        // 过滤掉消息不足 2 条的
        const candidates = unevaluated.filter(c => c.messageCount >= 2);

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
                createEvaluationPlaceholder(conv.id);
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
                        updateEvalSource(convId, 'auto_cron');
                    }
                    console.log(`[AutoEval:BG] ${convId}: ${result ? '成功' : '跳过'}`);

                    // 追加轨迹评测：从最后一条 assistant 消息的 meta 中提取 agentTrace
                    try {
                        const lastAssistant = await getLastAssistantMessage(convId);
                        const lastUser = await getLastUserMessage(convId);

                        const meta = lastAssistant?.meta || {};
                        const agentTrace = meta.agentTrace;

                        if (agentTrace && Array.isArray(agentTrace) && agentTrace.length > 0 && lastUser) {
                            const safetyData = meta.safety || { label: 'normal', score: 0 };
                            const emotionStep = agentTrace.find((s: any) => s.agent === 'emotion');
                            const emotionData = emotionStep?.output || { label: 'neutral', score: 5 };
                            const routeType = meta.routeType || meta.state?.route || 'support';
                            const adaptiveMode = meta.adaptiveMode || 'companion';

                            const traceResult = await evaluateTrace({
                                conversationId: convId,
                                userMessage: lastUser.content,
                                aiReply: lastAssistant?.content,
                                traceSteps: agentTrace,
                                routeType,
                                safetyData,
                                emotionData,
                                adaptiveMode,
                                toolCalls: meta.toolCalls || [],
                                guardResult: meta.guardResult,
                            }, {
                                apiKey: process.env.DEEPSEEK_API_KEY || '',
                                apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1',
                                model: process.env.EVAL_MODEL || DEEPSEEK_MODEL,
                            });
                            writeTraceEval(traceResult, {
                                traceJson: JSON.stringify(agentTrace),
                                userMessage: lastUser.content,
                                aiReply: lastAssistant?.content,
                                evalSource: 'auto_cron',
                            });
                            console.log(`[AutoEval:BG] 轨迹评测 ${convId}: ${traceResult.traceGrade} (${traceResult.traceScore})`);
                        }
                    } catch (traceErr) {
                        // 轨迹评测失败不影响主流程
                        console.error(`[AutoEval:BG] 轨迹评测 ${convId} 失败:`, traceErr);
                    }
                } catch (error) {
                    console.error(`[AutoEval:BG] ${convId} 失败:`, error);
                    try {
                        markEvaluationFailed(convId);
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
