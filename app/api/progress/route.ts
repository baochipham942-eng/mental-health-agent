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

const DB_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

/** 判断是否为可重试的数据库/网络错误 */
function isRetryableDbError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout|fetch failed|Can't reach database|Connection terminated/i.test(msg);
}

/** 带超时的 Promise */
function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`DB query timeout after ${ms}ms`)), ms);
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

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

    // 带超时 + 重试查询，防御 Neon 冷启动
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const timeline = await withTimeout(
          () => getProgressTimeline(session.user.id, days),
          DB_TIMEOUT_MS,
        );

        cache.set(cacheKey, { data: timeline, ts: Date.now() });
        if (cache.size > 100) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }

        return NextResponse.json(timeline);
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES && isRetryableDbError(error)) {
          const backoffMs = 1000 * (attempt + 1);
          console.warn(`[Progress] Attempt ${attempt + 1} failed, retrying in ${backoffMs}ms:`,
            error instanceof Error ? error.message : error);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        break;
      }
    }

    console.error('[Progress] GET error after retries:', lastError);
    return NextResponse.json(
      { error: lastError instanceof Error ? lastError.message : 'Database unavailable' },
      { status: 503 },
    );
  } catch (error: any) {
    console.error('[Progress] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
