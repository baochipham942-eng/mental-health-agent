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

export const { auth, signIn, signOut } = NextAuth({
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
    callbacks: {
        async jwt({ token, user, trigger, session }) {
            // Initial sign in
            if (user) {
                token.id = user.id;
                token.name = (user as any).username;
                token.nickname = (user as any).nickname;
                token.avatar = (user as any).avatar;
            }

            // Periodically refresh data from DB to ensure personality is synced
            // or if we have a trigger (though trigger is client-side)
            // Force refresh for 'demo' user for this task session
            if (token.id && (!token.nickname || token.name === 'demo')) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: token.id as string },
                    select: { nickname: true, avatar: true }
                });
                if (dbUser) {
                    token.nickname = dbUser.nickname;
                    token.avatar = dbUser.avatar;
                }
            }

            return token;
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
                session.user.name = token.name as string;
                (session.user as any).nickname = token.nickname;
                (session.user as any).avatar = token.avatar;
            }
            return session;
        }
    }
});
