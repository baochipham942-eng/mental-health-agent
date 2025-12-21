
import { prisma } from '@/lib/db/prisma';

async function main() {
    const sessionId = process.argv[2];
    if (!sessionId) {
        console.error('Please provide a session ID');
        process.exit(1);
    }

    const conversation = await prisma.conversation.findUnique({
        where: { id: sessionId },
        include: {
            messages: {
                orderBy: { createdAt: 'asc' }
            }
        }
    });

    if (!conversation) {
        console.log('Session not found');
        return;
    }

    console.log(`Session: ${conversation.title} (${conversation.id})`);
    console.log(`Status: ${conversation.status}`);
    console.log('--- Messages ---');
    conversation.messages.forEach(msg => {
        console.log(`[${msg.role.toUpperCase()}] (${msg.createdAt.toISOString()})`);
        console.log(msg.content);
        if (msg.meta) {
            console.log('Meta:', JSON.stringify(msg.meta, null, 2));
        }
        console.log('---');
    });
}

main();
