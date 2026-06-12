import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import { isAdminSession } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

const userListSelect = {
    id: true,
    username: true,
    nickname: true,
    avatar: true,
    phone: true,
    createdAt: true,
    lastLoginAt: true,
    lastSessionAt: true,
    _count: {
        select: {
            conversations: true,
            labSessions: true,
        },
    },
    conversations: {
        select: {
            updatedAt: true,
            _count: {
                select: { messages: true }
            }
        }
    },
    labSessions: {
        select: {
            updatedAt: true,
            messageCount: true
        }
    }
} satisfies Prisma.UserSelect;

type UserListRow = Prisma.UserGetPayload<{ select: typeof userListSelect }>;
type FormattedUser = ReturnType<typeof formatUser>;

const dbSortFields = new Set(['createdAt', 'lastLoginAt', 'nickname', 'username']);
const computedSortFields = new Set([
    'lastActiveAt',
    'conversationCount',
    'conversationMessageCount',
    'labSessionCount',
    'labMessageCount',
]);

/**
 * 手机号脱敏处理
 * 例如: 13812345678 -> 138****5678
 */
function maskPhone(phone: string | null): string | null {
    if (!phone) return null;
    if (phone.length < 7) return phone;
    return phone.slice(0, 3) + '****' + phone.slice(-4);
}

function getLatestDate(...dates: Array<Date | null | undefined>): Date | null {
    return dates.reduce<Date | null>((latest, date) => {
        if (!date) return latest;
        if (!latest || date.getTime() > latest.getTime()) return date;
        return latest;
    }, null);
}

function formatUser(user: UserListRow) {
    const conversationMessageCount = user.conversations.reduce(
        (sum, conv) => sum + conv._count.messages,
        0
    );
    const labMessageCount = user.labSessions.reduce(
        (sum, lab) => sum + (lab.messageCount || 0),
        0
    );
    const lastConversationAt = getLatestDate(...user.conversations.map((conv) => conv.updatedAt));
    const lastLabSessionAt = getLatestDate(...user.labSessions.map((lab) => lab.updatedAt));
    const lastActiveAt = getLatestDate(
        user.lastLoginAt,
        user.lastSessionAt,
        lastConversationAt,
        lastLabSessionAt
    );

    // 管理员手机号列表
    const adminPhones = ['15110203706', '18717878760'];
    const adminUsernames = ['demo', '15110203706', '18717878760'];

    return {
        id: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        avatar: user.avatar,
        phone: maskPhone(user.phone),
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() || null,
        lastActiveAt: lastActiveAt?.toISOString() || null,
        conversationCount: user._count.conversations,
        conversationMessageCount,
        labSessionCount: user._count.labSessions,
        labMessageCount,
        isAdmin: adminUsernames.includes(user.username) || Boolean(user.phone && adminPhones.includes(user.phone)),
    };
}

function getComputedSortValue(user: FormattedUser, sortBy: string): number {
    switch (sortBy) {
        case 'lastActiveAt':
            return user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
        case 'conversationCount':
            return user.conversationCount;
        case 'conversationMessageCount':
            return user.conversationMessageCount;
        case 'labSessionCount':
            return user.labSessionCount;
        case 'labMessageCount':
            return user.labMessageCount;
        default:
            return 0;
    }
}

/**
 * 获取注册用户列表（管理员专用）
 */
export async function GET(request: NextRequest) {
    try {
        // 验证管理员权限
        const session = await auth();
        const isAdmin = isAdminSession(session);

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // 获取查询参数
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');
        const search = searchParams.get('search') || '';
        const requestedSortBy = searchParams.get('sortBy') || 'lastActiveAt';
        const sortBy = dbSortFields.has(requestedSortBy) || computedSortFields.has(requestedSortBy)
            ? requestedSortBy
            : 'lastActiveAt';
        const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
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
        // lastActiveAt 是展示层合成字段，取 lastLoginAt / lastSessionAt / 最近会话更新时间的最大值。
        const orderByClause: Prisma.UserOrderByWithRelationInput[] = sortBy === 'lastLoginAt'
            ? [
                { lastLoginAt: { sort: sortOrder as Prisma.SortOrder, nulls: 'last' } },
                { createdAt: sortOrder as Prisma.SortOrder }
              ]
            : computedSortFields.has(sortBy)
            ? [{ createdAt: sortOrder as Prisma.SortOrder }]
            : [{ [sortBy]: sortOrder as Prisma.SortOrder }];

        const shouldSortInMemory = computedSortFields.has(sortBy);
        const users = await prisma.user.findMany({
            where: whereCondition,
            skip: shouldSortInMemory ? undefined : skip,
            take: shouldSortInMemory ? undefined : pageSize,
            orderBy: orderByClause,
            select: userListSelect,
        });

        const formattedUsers = users.map(formatUser);
        const pageUsers = shouldSortInMemory
            ? formattedUsers
                .sort((a, b) => {
                    const aValue = getComputedSortValue(a, sortBy);
                    const bValue = getComputedSortValue(b, sortBy);
                    return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
                })
                .slice(skip, skip + pageSize)
            : formattedUsers;

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
            users: pageUsers,
            stats: {
                totalUsers,
                todayNewUsers,
                activeUsers,
            },
        });

    } catch (error) {
        console.error('[API] Get users failed:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to get users',
        }, { status: 500 });
    }
}
