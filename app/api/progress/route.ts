/**
 * 进度追踪 API
 *
 * GET /api/progress?days=30 - 获取用户进度时间线
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getProgressTimeline } from '@/lib/ai/progress/tracker';

export const dynamic = 'force-dynamic';

// 简单内存缓存：避免短时间内重复查询 5 张表
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 60_000; // 60 秒

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');

    const cacheKey = `${session.user.id}:${days}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const timeline = await getProgressTimeline(session.user.id, days);

    cache.set(cacheKey, { data: timeline, ts: Date.now() });
    // 防止缓存无限增长
    if (cache.size > 100) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }

    return NextResponse.json(timeline);
  } catch (error: any) {
    console.error('[Progress] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
