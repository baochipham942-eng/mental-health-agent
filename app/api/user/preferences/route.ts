/**
 * 用户偏好 API
 *
 * PATCH /api/user/preferences - 更新用户偏好（治疗师选择等）
 * GET   /api/user/preferences - 获取用户偏好
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { preferredTherapist } = await request.json();

    // 验证治疗师 ID
    const validIds = ['xiaowarm', 'mingyuan', 'qinghe', null];
    if (!validIds.includes(preferredTherapist)) {
      return NextResponse.json({ error: '无效的治疗师选择' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferredTherapist },
    });

    return NextResponse.json({ success: true, preferredTherapist });
  } catch (error: any) {
    console.error('[Preferences] PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferredTherapist: true },
    });

    return NextResponse.json({
      preferredTherapist: user?.preferredTherapist || null,
    });
  } catch (error: any) {
    console.error('[Preferences] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
