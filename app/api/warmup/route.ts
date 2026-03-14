import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { deepseek } from '@/lib/ai/deepseek';

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
export async function POST() {
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
      maxTokens: 1,
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

// 允许 GET 请求（方便健康检查工具调用）
export async function GET() {
  return POST();
}
