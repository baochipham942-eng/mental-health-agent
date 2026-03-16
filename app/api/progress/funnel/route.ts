import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/runtime/chat-auth';
import { trackFunnel, type FunnelEvent } from '@/lib/observability/funnel';

const VALID_EVENTS: FunnelEvent[] = [
  'l0_chat_start',
  'l1_skill_recommended',
  'l1_skill_clicked',
  'l1_skill_completed',
  'l2_lab_entered',
];

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    const body = await request.json();
    const { event, sessionId, skillType, score } = body;

    if (!event || !VALID_EVENTS.includes(event)) {
      return NextResponse.json({ error: 'Invalid funnel event' }, { status: 400 });
    }

    await trackFunnel(event, { userId, sessionId, skillType, score });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[FunnelAPI] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
