import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findFirst({
        where: { OR: [{ phone: '18717878760' }, { username: '18717878760' }] },
        select: { id: true, username: true, phone: true, passwordHash: true }
    });

    if (!user) {
        console.log('User not found');
        return;
    }

    console.log('User found:', user.username, user.phone);
    console.log('Password hash:', user.passwordHash);

    // Test some common passwords
    const testPasswords = ['123456', 'password', '111111', 'test123'];
    for (const pwd of testPasswords) {
        const match = await bcrypt.compare(pwd, user.passwordHash);
        console.log('Password "' + pwd + '": ' + (match ? 'MATCH' : 'no match'));
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
