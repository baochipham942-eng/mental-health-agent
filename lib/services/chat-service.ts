import { prisma } from '@/lib/db/prisma';

export class ChatService {
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
