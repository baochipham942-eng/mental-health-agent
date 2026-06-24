import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { deepseek } from '@/lib/ai/deepseek';
import { checkRateLimit } from '@/lib/api/rate-limit';

/**
 * 冷启动预热端点
 *
 * 在 Onboarding 流程中由客户端触发，提前预热：
 * 1. Prisma 连接池（数据库连接建立）
 * 2. DeepSeek API 连接（TCP/TLS 握手）
 *
 * 时机：
 * - 用户在 Onboarding 选择图片时触发（注册前 10-20 秒）
 * - 无需鉴权，仅做连接预热，不返回任何业务数据
 */
function warmupRateLimitKey(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip');
  return `warmup:${forwardedFor || realIp || 'unknown'}`;
}

async function runWarmup() {
  const start = Date.now();
  const results: Record<string, { ok: boolean; ms: number }> = {};

  // 1. 预热 Prisma 连接池 — 执行最轻量的查询
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    results.db = { ok: true, ms: Date.now() - dbStart };
  } catch {
    results.db = { ok: false, ms: Date.now() - start };
  }

  // 2. 预热 DeepSeek API 连接 — 建立 TCP/TLS，用最小 token 请求
  try {
    const llmStart = Date.now();
    const { generateText } = await import('ai');
    await generateText({
      model: deepseek('deepseek-chat'),
      prompt: 'hi',
      maxOutputTokens: 1,
    });
    results.llm = { ok: true, ms: Date.now() - llmStart };
  } catch {
    // LLM 预热失败不阻塞，连接本身已建立
    results.llm = { ok: false, ms: Date.now() - start };
  }

  return NextResponse.json({
    warmed: true,
    totalMs: Date.now() - start,
    results,
  });
}

export async function POST(request: Request) {
  const limit = checkRateLimit(warmupRateLimitKey(request), 3, 60_000);
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many warmup requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((limit.retryAfterMs || 0) / 1000)) },
      },
    );
  }

  return runWarmup();
}

// GET 只做轻量存活响应，避免公开健康检查触发 DB/LLM 成本。
export async function GET() {
  return NextResponse.json({ ok: true });
}
