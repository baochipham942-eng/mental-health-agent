import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const phones = ['18600662543', '17717096245'];

    for (const phone of phones) {
        const user = await prisma.user.findFirst({
            where: { OR: [{ username: phone }, { phone: phone }] },
            include: {
                conversations: {
                    orderBy: { updatedAt: 'desc' },
                    take: 3,
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true,
                        _count: { select: { messages: true } }
                    }
                }
            }
        });

        console.log(`\n📱 用户 ${phone} (${user?.nickname || '未找到'}):`);

        if (user && user.conversations.length > 0) {
            console.log(`   ✅ 已有 ${user.conversations.length} 个会话:`);
            user.conversations.forEach((c, i) => {
                console.log(`   ${i + 1}. "${c.title || '新会话'}" - ${c._count.messages} 条消息`);
                console.log(`      最后活跃: ${c.updatedAt.toLocaleString('zh-CN')}`);
            });
        } else if (user) {
            console.log(`   ⏳ 已登录但暂无会话记录`);
        } else {
            console.log(`   ❌ 用户不存在`);
        }
    }
}

main()
    .catch((e) => { console.error('Error:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
