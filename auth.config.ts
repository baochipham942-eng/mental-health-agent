import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
    pages: {
        signIn: '/login',
    },
    providers: [
        // Added later in auth.ts
    ],
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;

            // 受保护的路由：根路由、/c/[sessionId]、/dashboard/*
            const isProtectedRoute =
                nextUrl.pathname === '/' ||
                nextUrl.pathname.startsWith('/c/') ||
                nextUrl.pathname.startsWith('/dashboard');

            if (isProtectedRoute) {
                if (isLoggedIn) return true;
                return false; // Redirect unauthenticated users to login page
            }

            // 已登录用户访问 /login，重定向到首页
            if (isLoggedIn && nextUrl.pathname === '/login') {
                return Response.redirect(new URL('/', nextUrl));
            }

            return true;
        },
    },
} satisfies NextAuthConfig;

