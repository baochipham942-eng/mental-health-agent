/**
 * 批量生成历史会话摘要的脚本
 * 
 * 运行方式: npx tsx scripts/generate-historical-summaries.ts
 * 
 * 功能:
 * - 查找所有已结束但没有摘要的会话
 * - 批量调用 DeepSeek 生成摘要
 * - 带有速率限制和错误处理
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { generateSessionSummary } from '../lib/ai/summary';

const prisma = new PrismaClient();

// 速率限制：每次请求之间的延迟（毫秒）
const RATE_LIMIT_DELAY = 2000;

// 最小消息数量要求
const MIN_MESSAGES = 2;

// 定义包含 messages 的类型
type ConversationWithMessages = Prisma.ConversationGetPayload<{
    include: { messages: true };
}>;

async function main() {
    console.log('🚀 开始批量生成历史会话摘要...\n');

    try {
        // 1. 查找所有没有摘要的会话（status 不是 ACTIVE 或者会话已经超过1天没活动）
        const conversationsWithoutSummary: ConversationWithMessages[] = await prisma.conversation.findMany({
            where: {
                summary: null, // 没有摘要
                OR: [
                    { status: 'ENDED' },
                    { status: 'COMPLETED' },
                    {
                        // 超过1天没活动的会话也视为结束
                        updatedAt: {
                            lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        },
                    },
                ],
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        console.log(`📋 找到 ${conversationsWithoutSummary.length} 个需要生成摘要的会话\n`);

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (let i = 0; i < conversationsWithoutSummary.length; i++) {
            const conversation = conversationsWithoutSummary[i];
            const progress = `[${i + 1}/${conversationsWithoutSummary.length}]`;

            // 检查消息数量
            if (conversation.messages.length < MIN_MESSAGES) {
                console.log(`${progress} ⏭️  跳过会话 ${conversation.id.slice(0, 8)}... (消息数: ${conversation.messages.length})`);
                skipCount++;
                continue;
            }

            console.log(`${progress} 📝 正在处理会话 ${conversation.id.slice(0, 8)}... (消息数: ${conversation.messages.length})`);

            try {
                // 生成摘要
                const summaryData = await generateSessionSummary({
                    id: conversation.id,
                    userId: conversation.userId,
                    messages: conversation.messages.map((m) => ({
                        role: m.role,
                        content: m.content,
                        createdAt: m.createdAt,
                    })),
                });

                // 保存到数据库
                await prisma.sessionSummary.create({
                    data: {
                        conversationId: conversation.id,
                        userId: conversation.userId,
                        mainTopic: summaryData.mainTopic,
                        startTime: summaryData.startTime,
                        endTime: summaryData.endTime,
                        duration: summaryData.duration,
                        emotionInitial: summaryData.emotionInitial,
                        emotionFinal: summaryData.emotionFinal,
                        moodChange: summaryData.emotionFinal.score - summaryData.emotionInitial.score,
                        keyInsights: summaryData.keyInsights,
                        actionItems: summaryData.actionItems,
                        keyTopics: summaryData.keyTopics,
                        therapistNote: summaryData.therapistNote,
                    },
                });

                console.log(`${progress} ✅ 成功: ${summaryData.mainTopic.slice(0, 30)}...`);
                successCount++;

                // 速率限制
                if (i < conversationsWithoutSummary.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                }
            } catch (error) {
                console.error(`${progress} ❌ 失败:`, error instanceof Error ? error.message : error);
                errorCount++;
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log('📊 批量生成完成:');
        console.log(`   ✅ 成功: ${successCount}`);
        console.log(`   ⏭️  跳过: ${skipCount}`);
        console.log(`   ❌ 失败: ${errorCount}`);
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ 脚本执行失败:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
