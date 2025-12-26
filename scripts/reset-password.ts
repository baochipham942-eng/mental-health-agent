
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const username = '15214392864';
    const newPassword = '123456';

    console.log(`Resetting password for user: ${username}`);

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    try {
        const user = await prisma.user.update({
            where: { username },
            data: { passwordHash: hashedPassword },
        });
        console.log(`✅ Password reset successfully for user: ${user.nickname} (${user.username})`);
        console.log(`New password: ${newPassword}`);
    } catch (error) {
        console.error('❌ Failed to reset password:', error);
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
