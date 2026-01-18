import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * 检查管理员权限
 */
async function checkAdminAuth() {
    const session = await auth();
    const userPhone = (session?.user as any)?.phone;
    const isAdmin = session?.user?.name === 'demo' ||
                   userPhone === '15110203706' ||
                   session?.user?.name === '15110203706';
    return isAdmin;
}

/**
 * 生成随机邀请码
 * 排除易混淆字符 (0, O, 1, I)
 */
function generateCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
        const randomIndex = crypto.randomInt(0, chars.length);
        code += chars[randomIndex];
    }
    return code;
}

/**
 * 获取邀请码列表（管理员专用）
 */
export async function GET(request: NextRequest) {
    try {
        if (!(await checkAdminAuth())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');
        const search = searchParams.get('search') || '';
        const status = searchParams.get('status') || 'all'; // all, active, expired, exhausted
        const sortBy = searchParams.get('sortBy') || 'createdAt';
        const sortOrder = searchParams.get('sortOrder') || 'desc';
        const skip = (page - 1) * pageSize;

        // 构建过滤条件
        const now = new Date();
        let whereCondition: any = {};

        if (search) {
            whereCondition.code = { contains: search.toUpperCase(), mode: 'insensitive' };
        }

        if (status === 'active') {
            // 有效的：未过期且未用完
            whereCondition.expiresAt = { gt: now };
            whereCondition.usedCount = { lt: prisma.invitationCode.fields.maxUsages };
        } else if (status === 'expired') {
            whereCondition.expiresAt = { lte: now };
        } else if (status === 'exhausted') {
            // 已用完但未过期
            whereCondition.expiresAt = { gt: now };
        }

        // 查询总数
        const total = await prisma.invitationCode.count({ where: whereCondition });

        // 查询邀请码列表
        const invites = await prisma.invitationCode.findMany({
            where: whereCondition,
            skip,
            take: pageSize,
            orderBy: { [sortBy]: sortOrder },
        });

        // 后处理：筛选已用完的
        let filteredInvites = invites;
        if (status === 'exhausted') {
            filteredInvites = invites.filter(inv => inv.usedCount >= inv.maxUsages);
        } else if (status === 'active') {
            filteredInvites = invites.filter(inv => inv.usedCount < inv.maxUsages);
        }

        // 格式化响应
        const formattedInvites = filteredInvites.map((invite) => {
            const isExpired = invite.expiresAt <= now;
            const isExhausted = invite.usedCount >= invite.maxUsages;
            let statusText = '有效';
            if (isExpired) statusText = '已过期';
            else if (isExhausted) statusText = '已用完';

            return {
                id: invite.id,
                code: invite.code,
                type: invite.type,
                maxUsages: invite.maxUsages,
                usedCount: invite.usedCount,
                remainingUsages: Math.max(0, invite.maxUsages - invite.usedCount),
                expiresAt: invite.expiresAt.toISOString(),
                channel: invite.channel,
                createdAt: invite.createdAt.toISOString(),
                status: statusText,
                isExpired,
                isExhausted,
            };
        });

        // 统计数据
        const [totalInvites, activeInvites, expiredInvites, totalUsed] = await Promise.all([
            prisma.invitationCode.count(),
            prisma.invitationCode.count({
                where: { expiresAt: { gt: now } },
            }),
            prisma.invitationCode.count({
                where: { expiresAt: { lte: now } },
            }),
            prisma.invitationCode.aggregate({
                _sum: { usedCount: true },
            }),
        ]);

        return NextResponse.json({
            total,
            page,
            pageSize,
            invites: formattedInvites,
            stats: {
                totalInvites,
                activeInvites,
                expiredInvites,
                totalUsed: totalUsed._sum.usedCount || 0,
            },
        });

    } catch (error) {
        console.error('[API] Get invites failed:', error);
        return NextResponse.json({
            error: 'Failed to get invites',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * 创建邀请码（管理员专用）
 */
export async function POST(request: NextRequest) {
    try {
        if (!(await checkAdminAuth())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const {
            count = 1,
            maxUsages = 5,
            daysValid = 7,
            channel = 'admin',
        } = body;

        // 参数验证
        if (count < 1 || count > 100) {
            return NextResponse.json({ error: '生成数量必须在 1-100 之间' }, { status: 400 });
        }
        if (maxUsages < 1 || maxUsages > 1000) {
            return NextResponse.json({ error: '可用次数必须在 1-1000 之间' }, { status: 400 });
        }
        if (daysValid < 1 || daysValid > 365) {
            return NextResponse.json({ error: '有效天数必须在 1-365 之间' }, { status: 400 });
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + daysValid);

        const createdCodes = [];

        for (let i = 0; i < count; i++) {
            let code = generateCode();
            // 碰撞检查
            while (await prisma.invitationCode.findUnique({ where: { code } })) {
                code = generateCode();
            }

            const invite = await prisma.invitationCode.create({
                data: {
                    code,
                    maxUsages,
                    expiresAt,
                    channel,
                    type: 'REGISTRATION',
                },
            });
            createdCodes.push(invite);
        }

        return NextResponse.json({
            success: true,
            count: createdCodes.length,
            invites: createdCodes.map(inv => ({
                id: inv.id,
                code: inv.code,
                maxUsages: inv.maxUsages,
                expiresAt: inv.expiresAt.toISOString(),
                channel: inv.channel,
            })),
        });

    } catch (error) {
        console.error('[API] Create invites failed:', error);
        return NextResponse.json({
            error: 'Failed to create invites',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * 更新邀请码（管理员专用）
 * 支持修改可用次数、作废邀请码
 */
export async function PATCH(request: NextRequest) {
    try {
        if (!(await checkAdminAuth())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { id, maxUsages, action } = body;

        if (!id) {
            return NextResponse.json({ error: '缺少邀请码 ID' }, { status: 400 });
        }

        // 查找邀请码
        const invite = await prisma.invitationCode.findUnique({ where: { id } });
        if (!invite) {
            return NextResponse.json({ error: '邀请码不存在' }, { status: 404 });
        }

        // 作废操作：将过期时间设为现在
        if (action === 'revoke') {
            const updated = await prisma.invitationCode.update({
                where: { id },
                data: { expiresAt: new Date() },
            });
            return NextResponse.json({
                success: true,
                message: '邀请码已作废',
                invite: {
                    id: updated.id,
                    code: updated.code,
                    expiresAt: updated.expiresAt.toISOString(),
                },
            });
        }

        // 修改可用次数
        if (maxUsages !== undefined) {
            if (maxUsages < invite.usedCount) {
                return NextResponse.json({
                    error: `可用次数不能小于已使用次数 (${invite.usedCount})`
                }, { status: 400 });
            }
            if (maxUsages < 1 || maxUsages > 1000) {
                return NextResponse.json({ error: '可用次数必须在 1-1000 之间' }, { status: 400 });
            }

            const updated = await prisma.invitationCode.update({
                where: { id },
                data: { maxUsages },
            });
            return NextResponse.json({
                success: true,
                message: '可用次数已更新',
                invite: {
                    id: updated.id,
                    code: updated.code,
                    maxUsages: updated.maxUsages,
                    usedCount: updated.usedCount,
                },
            });
        }

        return NextResponse.json({ error: '未指定操作' }, { status: 400 });

    } catch (error) {
        console.error('[API] Update invite failed:', error);
        return NextResponse.json({
            error: 'Failed to update invite',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * 删除邀请码（管理员专用）
 */
export async function DELETE(request: NextRequest) {
    try {
        if (!(await checkAdminAuth())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: '缺少邀请码 ID' }, { status: 400 });
        }

        // 查找邀请码
        const invite = await prisma.invitationCode.findUnique({ where: { id } });
        if (!invite) {
            return NextResponse.json({ error: '邀请码不存在' }, { status: 404 });
        }

        // 如果已被使用，不允许删除
        if (invite.usedCount > 0) {
            return NextResponse.json({
                error: '该邀请码已被使用，无法删除。可以选择作废操作。'
            }, { status: 400 });
        }

        await prisma.invitationCode.delete({ where: { id } });

        return NextResponse.json({
            success: true,
            message: '邀请码已删除',
        });

    } catch (error) {
        console.error('[API] Delete invite failed:', error);
        return NextResponse.json({
            error: 'Failed to delete invite',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
