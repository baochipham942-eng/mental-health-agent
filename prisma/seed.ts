import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const password = await bcrypt.hash('demo123', 10);
    const user = await prisma.user.upsert({
        where: { username: 'demo' },
        update: {
            passwordHash: password,
        },
        create: {
            username: 'demo',
            passwordHash: password,
            nickname: '测试用户',
        },
    });
    console.log({ user });
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
