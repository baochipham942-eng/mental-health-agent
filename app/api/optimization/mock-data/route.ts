import { NextResponse } from 'next/server';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';
import {
    findRecentConversationsWithMessages,
    findEvalByConversationId,
    createEval,
} from '@/lib/eval/data-bridge';

export const dynamic = 'force-dynamic';

/**
 * 快速插入模拟评估数据（不调用 AI）
 */
export async function POST(request: Request) {
    try {
        const { admin: isAdmin } = await checkAdmin();

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        console.log('[Mock] Creating mock evaluation data...');

        const recentConversations = await findRecentConversationsWithMessages(2);

        if (recentConversations.length === 0) {
            return NextResponse.json({
                error: 'No conversations found',
                imported: 0,
            });
        }

        const results = [];

        for (const conv of recentConversations) {
            const existing = findEvalByConversationId(conv.id);

            if (existing) {
                results.push({
                    conversationId: conv.id,
                    status: 'skipped',
                    reason: 'Already evaluated',
                });
                continue;
            }

            createEval({
                conversationId: conv.id,
                userId: conv.userId,
                legalScore: 6,
                legalIssues: ['未在适当时机建议寻求专业帮助（如精神科医生、律师等）'],
                ethicalScore: 8,
                ethicalIssues: [],
                professionalScore: 7,
                professionalIssues: [
                    '对测试性/闲聊性消息过度解读',
                    '未能识别用户真实意图',
                ],
                uxScore: 7,
                uxIssues: ['回复略显过度咨询化，缺乏自然感'],
                overallScore: 7.0,
                overallGrade: 'C',
                improvements: ['建议在对话中更自然地引导用户', '优化对用户意图的识别'],
            });

            results.push({
                conversationId: conv.id,
                status: 'success',
                grade: 'C',
                score: 73.75,
            });
        }

        const imported = results.filter(r => r.status === 'success').length;

        console.log(`[Mock] Created ${imported} mock evaluations`);

        return NextResponse.json({
            success: true,
            total: recentConversations.length,
            imported,
            results,
            message: '已创建模拟评估数据（用于测试）',
        });

    } catch (error) {
        console.error('[Mock] Failed:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Mock data creation failed',
        }, { status: 500 });
    }
}
