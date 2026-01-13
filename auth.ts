import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';

async function getUser(username: string): Promise<User | null> {
    try {
        const user = await prisma.user.findUnique({ where: { username } });
        return user;
    } catch (error) {
        console.error('Failed to fetch user:', error);
        throw new Error('Failed to fetch user.');
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            async authorize(credentials) {
                // Scenario 1: Quick Login (One-click)
                if (credentials.quickLoginToken) {
                    const token = credentials.quickLoginToken as string;
                    const user = await prisma.user.findFirst({ where: { quickLoginToken: token } });
                    if (user) return user;
                    return null;
                }

                // Scenario 2: Standard Login (Username/Phone + Password)
                const parsedCredentials = z
                    .object({ username: z.string(), password: z.string().min(6) })
                    .safeParse(credentials);

                if (parsedCredentials.success) {
                    const { username, password } = parsedCredentials.data;

                    // Support login by username OR phone
                    const user = await prisma.user.findFirst({
                        where: {
                            OR: [
                                { username: username },
                                { phone: username }
                            ]
                        }
                    });

                    if (!user) return null;

                    const passwordsMatch = await bcrypt.compare(password, user.passwordHash);
                    if (passwordsMatch) return user;
                }

                console.log('Invalid credentials');
                return null;
            },
        }),
    ],
    events: {
        async signIn({ user }) {
            // 异步更新最后登录时间，不阻塞登录流程
            if (user?.id) {
                prisma.user.update({
                    where: { id: user.id },
                    data: { lastLoginAt: new Date() }
                }).catch(err => console.error('Failed to update lastLoginAt:', err));
            }
        }
    },
    callbacks: {
        async jwt({ token, user, trigger, session }) {
            // Initial sign in
            if (user && user.id) {
                token.id = user.id;
                token.name = user.username;
                token.username = user.username;
                token.nickname = user.nickname;
                token.avatar = user.avatar;
                token.phone = user.phone;
                token.quickLoginToken = user.quickLoginToken;
            }

            // Periodically refresh data from DB to ensure personality is synced
            // or if we have a trigger (though trigger is client-side)
            // Force refresh for 'demo' user for this task session
            // Also refresh if we are missing key fields like phone or quickLoginToken (e.g. after schema update)
            if (token.id && (!token.nickname || token.name === 'demo' || !token.phone || !token.quickLoginToken)) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: token.id as string },
                    select: { nickname: true, avatar: true, phone: true, quickLoginToken: true }
                });
                if (dbUser) {
                    token.nickname = dbUser.nickname;
                    token.avatar = dbUser.avatar;
                    token.phone = dbUser.phone;
                    token.quickLoginToken = dbUser.quickLoginToken;
                }
            }

            return token;
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
                session.user.name = token.name as string;
                session.user.username = token.username;
                session.user.nickname = token.nickname;
                session.user.avatar = token.avatar;
                session.user.phone = token.phone;
                session.user.quickLoginToken = token.quickLoginToken;
            }
            return session;
        }
    }
});
