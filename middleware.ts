import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

const authMiddleware = NextAuth(authConfig).auth;

export default function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // 处理微信验证文件
    if (pathname === '/96400d7a291688c1138f110395a17948.txt') {
        return new NextResponse('9a5cf4bc73a97156f669a2b3930f475be8a3f340', {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });
    }

    // 其他请求走 NextAuth
    return (authMiddleware as any)(request);
}

export const config = {
    // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
    matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};
