
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const username = '15214392864';
    const password = '123456';

    console.log(`Verifying login for: ${username} with '${password}'`);

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { username: username },
                { phone: username }
            ]
        }
    });

    if (!user) {
        console.error('User not found!');
        return;
    }

    console.log(`User found: ${user.id}`);
    console.log(`Stored Hash: ${user.passwordHash}`);

    const match = await bcrypt.compare(password, user.passwordHash);
    console.log(`Password Match Code: ${match}`);
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
