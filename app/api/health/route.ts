import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return NextResponse.json({
            status: 'ok',
            env: process.env.NODE_ENV,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Health] DB check failed:', error);
        return NextResponse.json({
            status: 'error',
            env: process.env.NODE_ENV,
            timestamp: new Date().toISOString(),
            error: 'Database connection failed',
        }, { status: 503 });
    }
}
