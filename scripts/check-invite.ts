import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const code = process.argv[2] || 'XLSD2025';

    console.log(`\n🔍 检查邀请码: ${code}\n`);

    // 查找邀请码
    const invite = await prisma.invitationCode.findFirst({
        where: {
            code: { equals: code, mode: 'insensitive' }
        }
    });

    if (!invite) {
        console.log('❌ 邀请码不存在');

        // 列出所有可用的邀请码
        console.log('\n📋 数据库中的所有邀请码:');
        const allCodes = await prisma.invitationCode.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        if (allCodes.length === 0) {
            console.log('  (空)');
        } else {
            console.table(allCodes.map(c => ({
                Code: c.code,
                Used: `${c.usedCount}/${c.maxUsages}`,
                Expires: c.expiresAt.toLocaleString('zh-CN'),
                Expired: c.expiresAt < new Date() ? '是' : '否',
                Channel: c.channel || '-'
            })));
        }
    } else {
        console.log('✅ 邀请码存在:');
        console.log(`   Code: ${invite.code}`);
        console.log(`   使用情况: ${invite.usedCount}/${invite.maxUsages}`);
        console.log(`   过期时间: ${invite.expiresAt.toLocaleString('zh-CN')}`);
        console.log(`   已过期: ${invite.expiresAt < new Date() ? '是' : '否'}`);
        console.log(`   已用完: ${invite.usedCount >= invite.maxUsages ? '是' : '否'}`);
    }

    // 检查手机号是否已注册
    const phone = process.argv[3] || '17717096245';
    console.log(`\n🔍 检查手机号: ${phone}\n`);

    const user = await prisma.user.findFirst({
        where: {
            OR: [{ username: phone }, { phone: phone }]
        }
    });

    if (user) {
        console.log('✅ 手机号已注册:');
        console.log(`   用户名: ${user.username}`);
        console.log(`   昵称: ${user.nickname || '-'}`);
        console.log(`   创建时间: ${user.createdAt.toLocaleString('zh-CN')}`);
    } else {
        console.log('❌ 手机号未注册');
    }
}

main()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
