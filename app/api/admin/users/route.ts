import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * 手机号脱敏处理
 * 例如: 13812345678 -> 138****5678
 */
function maskPhone(phone: string | null): string | null {
    if (!phone) return null;
    if (phone.length < 7) return phone;
    return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/**
 * 获取注册用户列表（管理员专用）
 */
export async function GET(request: NextRequest) {
    try {
        // 验证管理员权限
        const session = await auth();
        const userPhone = (session?.user as any)?.phone;
        const isAdmin = session?.user?.name === 'demo' ||
                       userPhone === '15110203706' ||
                       session?.user?.name === '15110203706';

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // 获取查询参数
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');
        const search = searchParams.get('search') || '';
        const sortBy = searchParams.get('sortBy') || 'createdAt';
        const sortOrder = searchParams.get('sortOrder') || 'desc';
        const skip = (page - 1) * pageSize;

        // 构建搜索条件
        const whereCondition = search ? {
            OR: [
                { nickname: { contains: search, mode: 'insensitive' as const } },
                { username: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search } },
            ],
        } : {};

        // 查询用户总数
        const total = await prisma.user.count({ where: whereCondition });

        // 查询用户列表（包含会话数和实验室会话数统计）
        // 当按 lastLoginAt 排序时：有登录记录的按登录时间排序，没有的按注册时间排序
        const orderByClause = sortBy === 'lastLoginAt'
            ? [
                { lastLoginAt: { sort: sortOrder, nulls: 'last' as const } },
                { createdAt: sortOrder as 'asc' | 'desc' }  // 没有登录记录的按注册时间排序
              ]
            : { [sortBy]: sortOrder };

        const users = await prisma.user.findMany({
            where: whereCondition,
            skip,
            take: pageSize,
            orderBy: orderByClause,
            select: {
                id: true,
                username: true,
                nickname: true,
                avatar: true,
                phone: true,
                createdAt: true,
                lastLoginAt: true,
                _count: {
                    select: {
                        conversations: true,
                        labSessions: true,
                    },
                },
            },
        });

        // 管理员手机号列表
        const adminPhones = ['15110203706'];
        const adminUsernames = ['demo', '15110203706'];

        // 格式化响应，脱敏手机号，标记管理员
        const formattedUsers = users.map((user) => ({
            id: user.id,
            username: user.username,
            nickname: user.nickname || user.username,
            avatar: user.avatar,
            phone: maskPhone(user.phone),
            createdAt: user.createdAt.toISOString(),
            lastLoginAt: user.lastLoginAt?.toISOString() || null,
            conversationCount: user._count.conversations,
            labSessionCount: user._count.labSessions,
            isAdmin: adminUsernames.includes(user.username) || (user.phone && adminPhones.includes(user.phone)),
        }));

        // 统计数据
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [totalUsers, todayNewUsers, activeUsers] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({
                where: { createdAt: { gte: todayStart } },
            }),
            // 有至少一次会话的用户数
            prisma.user.count({
                where: {
                    conversations: { some: {} },
                },
            }),
        ]);

        return NextResponse.json({
            total,
            page,
            pageSize,
            users: formattedUsers,
            stats: {
                totalUsers,
                todayNewUsers,
                activeUsers,
            },
        });

    } catch (error) {
        console.error('[API] Get users failed:', error);
        return NextResponse.json({
            error: 'Failed to get users',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
