/**
 * 导入历史会话评估数据
 * 使用方法：
 * npx ts-node --project tsconfig.scripts.json scripts/import-test-evaluations.ts
 */

require('dotenv').config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { evaluateAndSaveConversation } from '../lib/actions/evaluation';

const prisma = new PrismaClient();

async function main() {
    console.log('📥 开始导入最近2条会话的评估数据...\n');

    try {
        // 1. 查询最近的2条会话
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
                title: true,
                createdAt: true,
                messages: {
                    select: {
                        id: true,
                    },
                },
            },
        });

        if (recentConversations.length === 0) {
            console.log('❌ 没有找到历史会话');
            return;
        }

        console.log(`✅ 找到 ${recentConversations.length} 条会话：`);
        recentConversations.forEach(c => {
            console.log(`  - ${c.title || c.id} (${c.messages.length} 条消息)`);
        });
        console.log('');

        // 2. 为每个会话生成评估
        for (const conv of recentConversations) {
            console.log(`🔍 评估会话: ${conv.title || conv.id}`);

            // 检查是否已有评估
            const existing = await prisma.conversationEvaluation.findUnique({
                where: { conversationId: conv.id },
            });

            if (existing) {
                console.log(`  ⏭️  已有评估，跳过`);
                continue;
            }

            // 生成评估
            const result = await evaluateAndSaveConversation(conv.id);

            if (result) {
                console.log(`  ✅ 评估完成！等级: ${result.overallGrade}, 得分: ${result.overallScore}`);
            } else {
                console.log(`  ❌ 评估失败`);
            }
            console.log('');
        }

        console.log('🎉 导入完成！现在可以运行优化分析了。');

    } catch (error) {
        console.error('❌ 导入失败:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);
