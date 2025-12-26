
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const username = '15214392864';
    console.log(`Searching for user: ${username}`);

    const user = await prisma.user.findUnique({
        where: { username },
    });

    if (user) {
        console.log('User found:');
        console.log('ID:', user.id);
        console.log('Nickname:', user.nickname);
        console.log('Password Hash:', user.passwordHash);
        console.log('Created At:', user.createdAt);
    } else {
        console.log('User not found.');
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
