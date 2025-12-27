import { NextResponse } from 'next/server';

export async function GET() {
    return new NextResponse('9a5cf4bc73a97156f669a2b3930f475be8a3f340', {
        status: 200,
        headers: {
            'Content-Type': 'text/plain',
        },
    });
}
