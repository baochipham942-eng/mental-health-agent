import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireEvalAdmin } from '../auth-guard';

/**
 * GET /api/eval/conversations — 列出可评测的已有会话
 * Query: ?type=all|conversation|lab&limit=50
 *
 * 返回普通聊天会话和实验室会话，用于 product 模式评测。
 */
export async function GET(req: NextRequest) {
  try {
    const denied = await requireEvalAdmin();
    if (denied) return denied;
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const type = req.nextUrl.searchParams.get('type') || 'all';

    const items: Array<{
      id: string;
      title: string;
      type: 'conversation' | 'lab';
      labType?: string;
      messageCount: number;
      firstPrompt: string;
      createdAt: string;
      updatedAt: string;
    }> = [];

    // 普通聊天会话
    if (type === 'all' || type === 'conversation') {
      const conversations = await prisma.conversation.findMany({
        where: {
          isHidden: false,
          messages: { some: {} },
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
          messages: {
            where: { role: 'user' },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { content: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });

      for (const c of conversations) {
        items.push({
          id: c.id,
          title: c.title || '无标题',
          type: 'conversation',
          messageCount: c._count.messages,
          firstPrompt: c.messages[0]?.content?.slice(0, 120) || '',
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        });
      }
    }

    // 实验室会话（智慧殿堂、镜像回廊、圆桌论道）
    if (type === 'all' || type === 'lab') {
      const labSessions = await prisma.labSession.findMany({
        where: {
          messageCount: { gt: 0 },
        },
        select: {
          id: true,
          title: true,
          labType: true,
          messageCount: true,
          createdAt: true,
          updatedAt: true,
          messages: {
            where: { role: 'user' },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { content: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });

      for (const ls of labSessions) {
        items.push({
          id: ls.id,
          title: ls.title || '无标题',
          type: 'lab',
          labType: ls.labType,
          messageCount: ls.messageCount,
          firstPrompt: ls.messages[0]?.content?.slice(0, 120) || '',
          createdAt: ls.createdAt.toISOString(),
          updatedAt: ls.updatedAt.toISOString(),
        });
      }
    }

    // 按更新时间排序
    items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json({ conversations: items.slice(0, limit) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
