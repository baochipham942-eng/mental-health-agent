import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { USER_PROFILES } from '@/lib/constants/userProfiles';
import { checkProfanity } from '@/lib/utils/profanity';

// 允许的头像路径列表
const ALLOWED_AVATARS = USER_PROFILES.map(p => p.avatar);

/**
 * PATCH /api/user/profile
 * 更新用户资料（头像和昵称）
 */
export async function PATCH(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: '未登录', code: 'UNAUTHORIZED' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { nickname, avatar } = body;

        // 验证至少有一个字段需要更新
        if (nickname === undefined && avatar === undefined) {
            return NextResponse.json(
                { error: '请提供需要更新的字段', code: 'NO_UPDATE' },
                { status: 400 }
            );
        }

        const updateData: { nickname?: string; avatar?: string } = {};

        // 验证头像
        if (avatar !== undefined) {
            if (!ALLOWED_AVATARS.includes(avatar)) {
                return NextResponse.json(
                    { error: '无效的头像选择', code: 'INVALID_AVATAR' },
                    { status: 400 }
                );
            }
            updateData.avatar = avatar;
        }

        // 验证昵称
        if (nickname !== undefined) {
            // 去除首尾空格
            const trimmedNickname = nickname.trim();

            // 检查长度
            if (trimmedNickname.length === 0) {
                return NextResponse.json(
                    { error: '昵称不能为空', code: 'EMPTY_NICKNAME' },
                    { status: 400 }
                );
            }

            if (trimmedNickname.length > 20) {
                return NextResponse.json(
                    { error: '昵称不能超过20个字符', code: 'NICKNAME_TOO_LONG' },
                    { status: 400 }
                );
            }

            // 检查违规词
            const profanityCheck = checkProfanity(trimmedNickname);
            if (profanityCheck.hasProfanity) {
                return NextResponse.json(
                    { error: `昵称${profanityCheck.reason}，请修改`, code: 'PROFANITY' },
                    { status: 400 }
                );
            }

            // 检查昵称是否与其他用户重复
            const existingUser = await prisma.user.findFirst({
                where: {
                    nickname: trimmedNickname,
                    NOT: { id: session.user.id }
                },
                select: { id: true }
            });

            if (existingUser) {
                return NextResponse.json(
                    { error: '该昵称已被其他用户使用', code: 'NICKNAME_TAKEN' },
                    { status: 400 }
                );
            }

            updateData.nickname = trimmedNickname;
        }

        // 更新数据库
        const updatedUser = await prisma.user.update({
            where: { id: session.user.id },
            data: updateData,
            select: {
                id: true,
                nickname: true,
                avatar: true
            }
        });

        return NextResponse.json({
            success: true,
            user: updatedUser
        });

    } catch (error) {
        console.error('Failed to update user profile:', error);
        return NextResponse.json(
            { error: '更新失败，请稍后重试', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/user/profile
 * 获取当前用户资料
 */
export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: '未登录', code: 'UNAUTHORIZED' },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                id: true,
                username: true,
                nickname: true,
                avatar: true
            }
        });

        if (!user) {
            return NextResponse.json(
                { error: '用户不存在', code: 'USER_NOT_FOUND' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            user,
            availableAvatars: USER_PROFILES.map(p => ({
                id: p.id,
                avatar: p.avatar,
                trait: p.trait
            }))
        });

    } catch (error) {
        console.error('Failed to get user profile:', error);
        return NextResponse.json(
            { error: '获取失败，请稍后重试', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
