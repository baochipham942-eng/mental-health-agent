const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
    try {
        const user = await prisma.user.findFirst({
            where: { phone: '13162000132' },
            select: { id: true, nickname: true }
        });

        if (!user) {
            console.log('未找到用户');
            return;
        }

        console.log(`\n=== 分析用户 ${user.nickname} 的最新会话 ===\n`);

        const conversations = await prisma.conversation.findMany({
            where: { userId: user.id },
            select: { id: true, title: true },
            orderBy: { createdAt: 'desc' },
            take: 1
        });

        if (conversations.length === 0) {
            console.log('无会话。');
            return;
        }

        const conversationId = conversations[0].id;
        const messages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' }, // 按时间正序排列，还原对话流
            select: {
                role: true,
                content: true,
                meta: true,
                createdAt: true
            }
        });

        messages.forEach((m, index) => {
            const roleIcon = m.role === 'user' ? '👤' : '🤖';
            const time = m.createdAt.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            console.log(`${roleIcon} [${index + 1}] [${time}] ${m.role.toUpperCase()}:`);
            console.log(`   Content: ${m.content}`);

            if (m.role === 'assistant' && m.meta) {
                const meta = m.meta;
                console.log(`   🧠 COT / Meta Analysis:`);

                if (meta.safety) {
                    console.log(`      🛡️ Safety: [${meta.safety.label}] Score: ${meta.safety.score}`);
                    console.log(`         Reasoning: ${meta.safety.reasoning}`);
                }

                if (meta.emotion) {
                    console.log(`      🎨 Emotion: [${meta.emotion.label}] Score: ${meta.emotion.score}`);
                }

                if (meta.state) {
                    console.log(`      🎯 State Reasoning: ${meta.state.reasoning}`);
                }

                if (meta.routeType) {
                    console.log(`      🛣️ Route: ${meta.routeType}`);
                }

                if (meta.assessmentStage) {
                    console.log(`      📋 Stage: ${meta.assessmentStage}`);
                }
            }
            console.log('-'.repeat(50));
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
})();
