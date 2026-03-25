import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/admin';

const EVAL_API_KEY = process.env.EVAL_API_KEY;

/**
 * Eval API 统一鉴权守卫
 *
 * 两种认证路径：
 * 1. API Key 认证 — 外部调用（cron / 第三方审阅者）通过 Authorization: Bearer <key>
 * 2. Session 认证 — Dashboard 浏览器访问通过 isAdmin()
 *
 * @param request 传入 request 时启用 API Key 认证路径
 * @returns null 表示鉴权通过，NextResponse 表示应直接返回的错误响应
 */
export async function requireEvalAuth(request?: NextRequest): Promise<NextResponse | null> {
  // 路径 1: API Key 认证
  if (request && EVAL_API_KEY) {
    const authHeader = request.headers.get('authorization');
    if (authHeader === `Bearer ${EVAL_API_KEY}`) {
      return null;
    }
  }

  // 路径 2: Session-based 管理员认证
  const { admin } = await isAdmin();
  if (admin) return null;

  return NextResponse.json({ error: 'Unauthorized: 需要管理员权限或有效的 EVAL_API_KEY' }, { status: 403 });
}

/** @deprecated 使用 requireEvalAuth 替代 */
export const requireEvalAdmin = requireEvalAuth;
