import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 查看最近注册的10个用户
    console.log('\n📋 最近注册的用户:\n');

    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
            username: true,
            phone: true,
            nickname: true,
            quickLoginToken: true,
            createdAt: true
        }
    });

    users.forEach((u, i) => {
        console.log(`${i + 1}. ${u.username} (${u.nickname || '无昵称'})`);
        console.log(`   手机: ${u.phone || '无'}`);
        console.log(`   Token: ${u.quickLoginToken ? '✅ (长度 ' + u.quickLoginToken.length + ')' : '❌ 无'}`);
        console.log(`   注册时间: ${u.createdAt.toLocaleString('zh-CN')}`);
        console.log('');
    });
}

main()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
