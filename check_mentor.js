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

        console.log(`正在检查用户 ${user.nickname} 的导师调用记录...`);

        const conversations = await prisma.conversation.findMany({
            where: { userId: user.id },
            select: { id: true }
        });
        const conversationIds = conversations.map(c => c.id);

        if (conversationIds.length === 0) {
            console.log('无会话。');
            return;
        }

        const messages = await prisma.message.findMany({
            where: {
                conversationId: { in: conversationIds }
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
                id: true,
                role: true,
                content: true,
                meta: true, // DB field is meta
                createdAt: true
            }
        });

        let foundMentor = false;

        for (const m of messages) {
            const meta = m.meta || {};
            const toolCalls = meta.toolCalls;

            // 1. Tool Calls
            if (toolCalls && Array.isArray(toolCalls)) {
                toolCalls.forEach(call => {
                    const funcName = call?.function?.name;
                    if (funcName === 'consult_mentor' || funcName === 'consult_specialist') {
                        let args = call.function.arguments;
                        if (typeof args === 'string') {
                            try { args = JSON.parse(args); } catch (e) { }
                        }
                        console.log(`✅ [${m.createdAt.toLocaleString('zh-CN')}] 触发了导师召唤: ${args?.mentorId || 'Unknown'} (Topic: ${args?.topic})`);
                        foundMentor = true;
                    }
                });
            }

            // 2. Content & Meta checks
            if (m.role === 'assistant') {
                const content = m.content || '';
                const mentors = [
                    { key: 'Socrates', name: '苏格拉底' },
                    { key: 'Adler', name: '阿德勒' },
                    { key: 'Jung', name: '荣格' },
                    { key: 'CBT', name: 'CBT治疗师' }
                ];

                mentors.forEach(mentor => {
                    if (content.includes(`${mentor.name}:`) || content.includes(`【${mentor.name}】`)) {
                        console.log(`✅ [${m.createdAt.toLocaleString('zh-CN')}] ${mentor.name} 参与了对话`);
                        foundMentor = true;
                    }
                });
            }
        }

        if (!foundMentor) {
            console.log('❌ 暂未发现与实验室大师（Socrates, Adler, Jung）的直接互动记录。');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
})();
