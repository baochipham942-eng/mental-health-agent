import { auth } from '@/auth';

/**
 * 保留昵称列表 — 普通用户不可使用
 */
export const RESERVED_NICKNAMES = ['demo'];

/**
 * 管理员白名单 — 从环境变量读取，逗号分隔
 * ADMIN_PHONES=15110203706,18717878760
 * ADMIN_USERNAMES=demo,15110203706
 */
const ADMIN_PHONES = (process.env.ADMIN_PHONES || '').split(',').filter(Boolean);
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || '').split(',').filter(Boolean);

/**
 * 同步判断：session 是否为管理员（不重复调 auth()）
 */
export function isAdminSession(session: any): boolean {
    if (!session?.user) return false;
    const userName = session.user.name;
    const userPhone = session.user.phone;
    return ADMIN_USERNAMES.includes(userName) || ADMIN_PHONES.includes(userPhone);
}

/**
 * 异步判断：当前请求是否管理员（内部调 auth()）
 */
export async function isAdmin(): Promise<{ admin: boolean; session: any }> {
    const session = await auth();
    return { admin: isAdminSession(session), session };
}
