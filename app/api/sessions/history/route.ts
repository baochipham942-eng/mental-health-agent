import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSessionHistory } from '@/lib/actions/chat';

export const dynamic = 'force-dynamic';

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const inputDate = new Date(date);
  const inputDateOnly = new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate());

  if (inputDateOnly.getTime() === today.getTime()) return '今天';
  if (inputDateOnly.getTime() === yesterday.getTime()) return '昨天';
  return `${inputDate.getMonth() + 1}月${inputDate.getDate()}日`;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await getSessionHistory(session.user.id);
    return NextResponse.json({
      sessions: sessions.map(item => ({
        id: item.id,
        title: item.title,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        relativeDate: formatRelativeDate(item.createdAt),
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load session history' },
      { status: 500 }
    );
  }
}
