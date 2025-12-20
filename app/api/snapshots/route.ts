/**
 * 快照管理 API
 * 
 * GET - 列出所有快照
 * POST - 创建新快照
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { saveConversationAsSnapshot, listSnapshots } from '@/lib/testing/snapshot';

export const dynamic = 'force-dynamic';

/**
 * GET /api/snapshots - 列出所有快照
 */
export async function GET() {
    const session = await auth();

    // 需要登录
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const snapshots = await listSnapshots();
        return NextResponse.json({ snapshots });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/snapshots - 创建新快照
 * 
 * Body: {
 *   conversationId: string;
 *   expectedOutcome?: { ... };
 *   tags?: string[];
 * }
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { conversationId, expectedOutcome, tags } = body;

        if (!conversationId) {
            return NextResponse.json(
                { error: 'conversationId is required' },
                { status: 400 }
            );
        }

        const snapshot = await saveConversationAsSnapshot(
            conversationId,
            expectedOutcome,
            tags || [],
            'manual'
        );

        return NextResponse.json({ success: true, snapshot });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
