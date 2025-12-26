
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Current time is 2025-12-27 (approx 00:00)
    // We want Yesterday (Dec 26) in local time (or broad UTC range)

    // Hardcode ranges to be safe relative to "Yesterday" request
    // Assuming "Yesterday" means Dec 26th
    const start = new Date('2025-12-26T00:00:00+08:00');
    const end = new Date('2025-12-27T00:00:00+08:00');

    console.log(`Query Range: ${start.toISOString()} to ${end.toISOString()}`);

    const users = await prisma.user.findMany({
        where: {
            createdAt: {
                gte: start,
                lt: end
            }
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            phone: true,
            username: true,
            nickname: true,
            createdAt: true
        }
    });

    console.log(`\n--- Registrations (Count: ${users.length}) ---`);
    users.forEach((u, i) => {
        console.log(`${i + 1}. ${u.nickname || '无昵称'} (${u.phone || u.username}) - ${u.createdAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    });

    console.log('\nDone.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
