/**
 * 进度追踪 API
 *
 * GET /api/progress?days=30 - 获取用户进度时间线
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getProgressTimeline } from '@/lib/ai/progress/tracker';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');

    const timeline = await getProgressTimeline(session.user.id, days);

    return NextResponse.json(timeline);
  } catch (error: any) {
    console.error('[Progress] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
