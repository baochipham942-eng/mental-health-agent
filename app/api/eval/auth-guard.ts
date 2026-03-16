import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/admin';

/**
 * Eval API 统一鉴权守卫
 * 所有评测相关 API 仅管理员可访问
 * @returns null 表示鉴权通过，NextResponse 表示应直接返回的错误响应
 */
export async function requireEvalAdmin(): Promise<NextResponse | null> {
  const { admin } = await isAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized: 需要管理员权限' }, { status: 403 });
  }
  return null;
}
