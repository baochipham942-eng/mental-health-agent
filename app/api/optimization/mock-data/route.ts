import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * 快速插入模拟评估数据（不调用 AI）
 */
export async function POST(request: Request) {
    try {
        // 验证管理员权限
        const session = await auth();
        const isAdmin = session?.user?.name === 'demo';

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        console.log('[Mock] Creating mock evaluation data...');

        // 查询最近的2条会话
        const recentConversations = await prisma.conversation.findMany({
            where: {
                messages: {
                    some: {}, // 至少有1条消息
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 2,
            select: {
                id: true,
                userId: true,
                title: true,
            },
        });

        if (recentConversations.length === 0) {
            return NextResponse.json({
                error: 'No conversations found',
                imported: 0,
            });
        }

        const results = [];

        // 为每个会话创建模拟评估
        for (const conv of recentConversations) {
            // 检查是否已有评估
            const existing = await prisma.conversationEvaluation.findUnique({
                where: { conversationId: conv.id },
            });

            if (existing) {
                results.push({
                    conversationId: conv.id,
                    status: 'skipped',
                    reason: 'Already evaluated',
                });
                continue;
            }

            // 创建模拟的低分评估（用于测试优化功能）
            await prisma.conversationEvaluation.create({
                data: {
                    conversationId: conv.id,
                    userId: conv.userId,

                    // 法律维度（低分）
                    legalScore: 6,
                    legalIssues: ['未在适当时机建议寻求专业帮助（如精神科医生、律师等）'],

                    // 伦理维度
                    ethicalScore: 8,
                    ethicalIssues: [],

                    // 专业性维度（低分）
                    professionalScore: 7,
                    professionalIssues: [
                        '对测试性/闲聊性消息过度解读',
                        '未能识别用户真实意图',
                    ],

                    // 用户体验维度
                    uxScore: 7,
                    uxIssues: ['回复略显过度咨询化，缺乏自然感'],

                    // 总体
                    overallScore: 7.0,
                    overallGrade: 'C',

                    // 改进建议
                    improvements: ['建议在对话中更自然地引导用户', '优化对用户意图的识别'],
                },
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
            error: 'Mock data creation failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
