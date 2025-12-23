'use server';

import { auth, signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { prisma } from '@/lib/db/prisma';
import { getRandomProfile, getProfileById } from '@/lib/constants/userProfiles';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', formData, { redirectTo: '/' });
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.';
                default:
                    return 'Something went wrong.';
            }
        }
        throw error;
    }
}

/**
 * 确保用户拥有人格特质（昵称和头像）
 * 如果没有则随机分配一个。
 * 针对 'demo' 用户，特殊处理为'忠诚'系列。
 */
export async function ensureUserProfile() {
    const session = await auth();
    if (!session?.user?.id) return null;

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, username: true, nickname: true, avatar: true, quickLoginToken: true }
    });

    if (!user) return null;

    let needsUpdate = false;
    let updateData: any = {};

    // Generate quickLoginToken if missing
    if (!user.quickLoginToken) {
        updateData.quickLoginToken = crypto.randomBytes(32).toString('hex');
        needsUpdate = true;
    }

    // Special handling: 'demo' user forced to 'loyal' profile
    if (user.username === 'demo') {
        const loyalProfile = getProfileById('loyal');
        if (loyalProfile && (user.nickname !== loyalProfile.nickname || user.avatar !== loyalProfile.avatar)) {
            updateData.nickname = loyalProfile.nickname;
            updateData.avatar = loyalProfile.avatar;
            needsUpdate = true;
        }
    }
    // General handling: assign random profile if missing nickname or avatar
    else if (!user.nickname || !user.avatar) {
        const randomProfile = getRandomProfile();
        updateData.nickname = randomProfile.nickname;
        updateData.avatar = randomProfile.avatar;
        needsUpdate = true;
    }

    if (needsUpdate) {
        await prisma.user.update({
            where: { id: user.id },
            data: updateData,
        });
        revalidatePath('/');
        return true;
    }

    return false;
}
