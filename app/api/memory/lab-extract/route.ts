
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { extractLabInsights } from '@/lib/memory/lab-extractor';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const userId = session?.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { messages, contextType, contextId } = body;

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
        }

        // Run extraction asynchronously?
        // Actually Vercel serverless might kill the process if we return early.
        // But for "extract-lab" we probably want to wait for it, or use `waitUntil` if available (Next.js 15 / Vercel pattern).
        // Since we don't have waitUntil handy or want to ensure completion, we'll await it.
        // It's called on "close", so user might navigate away.
        // Frontend should use `fetch(..., { keepalive: true })` or similar if possible.
        // Or just await it, it usually takes 2-3 seconds.

        const count = await extractLabInsights(userId, messages, contextType, contextId);

        return NextResponse.json({ success: true, count });

    } catch (error: any) {
        console.error('Lab Extraction API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
