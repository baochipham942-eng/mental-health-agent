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
            const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');

            if (isOnDashboard) {
                if (isLoggedIn) return true;
                return false; // Redirect unauthenticated users to login page
            } else if (isLoggedIn) {
                // Redirect authenticated users to dashboard if they visit asking page or login
                if (nextUrl.pathname === '/' || nextUrl.pathname === '/login') {
                    return Response.redirect(new URL('/dashboard', nextUrl));
                }
            } else {
                // Not logged in and not on dashboard (e.g. root /)
                // Redirect to login
                if (nextUrl.pathname === '/') {
                    return false;
                }
            }
            return true;
        },
    },
} satisfies NextAuthConfig;
