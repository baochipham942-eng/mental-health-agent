import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    // 创建 demo 用户（如果不存在）
    const existingUser = await prisma.user.findUnique({
        where: { username: 'demo' }
    });

    if (existingUser) {
        console.log('Demo user already exists:', existingUser.id);
        return;
    }

    const hashedPassword = await bcrypt.hash('demo123', 10);

    const user = await prisma.user.create({
        data: {
            username: 'demo',
            passwordHash: hashedPassword,
            nickname: 'Demo用户',
            phone: null,
            quickLoginToken: null,
        }
    });

    console.log('Created demo user:', user.id);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
