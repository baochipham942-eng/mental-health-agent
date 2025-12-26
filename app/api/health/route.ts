import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        status: 'ok',
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
}
