import { prisma } from '@/lib/db/prisma';

export class ChatService {
    /**
     * 服务端可信会话边界：conversation 存在且属于该用户才返回 true。
     * 所有按客户端传入 sessionId 写库的路径，必须先在 auth 之后过这里。
     * DB 错误向上抛（fail-closed），由路由层转成 5xx。
     */
    static async verifyConversationOwnership(sessionId: string, userId: string): Promise<boolean> {
        if (!sessionId || !userId) return false;
        const conversation = await prisma.conversation.findUnique({
            where: { id: sessionId },
            select: { userId: true },
        });
        return conversation?.userId === userId;
    }

    /**
     * Save a user message and optionally update conversation title if it's new
     */
    static async saveUserMessage(sessionId: string, userId: string, content: string) {
        if (!sessionId || !userId) return;

        try {
            await prisma.message.create({
                data: {
                    conversationId: sessionId,
                    role: 'user',
                    content: content,
                },
            });

            // Automatic title update logic
            // Check if this is the first few messages to update title
            const conversation = await prisma.conversation.findUnique({
                where: { id: sessionId },
                select: { title: true, _count: { select: { messages: true } } },
            });

            if (
                conversation &&
                (conversation._count.messages <= 2 || conversation.title === '新对话')
            ) {
                const newTitle =
                    content.substring(0, 20) + (content.length > 20 ? '...' : '');
                await prisma.conversation.update({
                    where: { id: sessionId },
                    data: {
                        title: newTitle,
                        updatedAt: new Date(),
                    },
                });
            }
        } catch (e) {
            console.error('[ChatService] Failed to save user message or update title', e);
        }
    }

    /**
     * Save an assistant message with metadata
     */
    static async saveAssistantMessage(
        sessionId: string,
        content: string,
        meta?: Record<string, any>
    ) {
        if (!sessionId) return;

        try {
            await prisma.message.create({
                data: {
                    conversationId: sessionId,
                    role: 'assistant',
                    content: content,
                    meta: meta,
                },
            });
        } catch (e) {
            console.error('[ChatService] Failed to save assistant message', e);
        }
    }
}
