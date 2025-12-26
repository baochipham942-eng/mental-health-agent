
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { username: 'demo' }
    });

    if (user) {
        console.log('User found:', user);
    } else {
        console.log('User demo NOT found.');
    }

    // Also check if there are other users with 'demo' in name
    const others = await prisma.user.findMany({
        where: { username: { contains: 'demo' } }
    });
    console.log('All demo users:', others.map(u => `${u.username} (${u.nickname})`));
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
