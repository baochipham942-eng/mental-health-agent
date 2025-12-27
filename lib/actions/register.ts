'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { getRandomProfile } from '@/lib/constants/userProfiles';

// Validation Schema
const RegisterSchema = z.object({
    phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的手机号'),
    password: z.string().min(6, '密码至少需要6位'),
    inviteCode: z.string().min(6, '请输入6-8位邀请码').max(8, '请输入6-8位邀请码'),
});

export async function registerUser(prevState: string | undefined, formData: FormData) {
    // 1. Parse Input
    const phone = formData.get('phone') as string;
    const password = formData.get('password') as string;
    const inviteCode = (formData.get('inviteCode') as string)?.trim();

    const validatedFields = RegisterSchema.safeParse({ phone, password, inviteCode });

    if (!validatedFields.success) {
        return { success: false, error: validatedFields.error.errors[0].message };
    }

    try {
        // 2. Check User Existence
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: phone },
                    { phone: phone }
                ]
            }
        });

        if (existingUser) {
            return { success: false, error: '该手机号已注册' };
        }

        // 3. Verify Invitation Code
        // Transaction to ensure atomicity of checking and incrementing usage
        const result = await prisma.$transaction(async (tx) => {
            // Find invitation code (case-insensitive)
            const invite = await tx.invitationCode.findFirst({
                where: {
                    code: {
                        equals: inviteCode,
                        mode: 'insensitive'
                    }
                }
            });

            if (!invite) {
                throw new Error('邀请码无效');
            }

            if (invite.expiresAt < new Date()) {
                throw new Error('邀请码已过期');
            }

            if (invite.usedCount >= invite.maxUsages) {
                throw new Error('邀请码已被使用完');
            }

            // Increment usage
            await tx.invitationCode.update({
                where: { id: invite.id },
                data: { usedCount: { increment: 1 } }
            });

            // 4. Create User
            const hashedPassword = await bcrypt.hash(password, 10);
            const quickLoginToken = crypto.randomBytes(32).toString('hex');
            const randomProfile = getRandomProfile();

            const newUser = await tx.user.create({
                data: {
                    username: phone, // Use phone as username
                    phone: phone,
                    passwordHash: hashedPassword,
                    quickLoginToken: quickLoginToken,
                    nickname: randomProfile.nickname,
                    avatar: randomProfile.avatar,
                }
            });


            return {
                success: true,
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    nickname: newUser.nickname,
                    avatar: newUser.avatar,
                    quickLoginToken: newUser.quickLoginToken
                }
            };
        });

        return result;

    } catch (error: any) {
        console.error('Registration error:', error);
        if (error.message) return { success: false, error: error.message };
        return { success: false, error: '注册失败，请稍后重试' };
    }
}
