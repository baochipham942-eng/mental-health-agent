import dotenv from 'dotenv';
import { NextRequest } from 'next/server.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

type ChatTurn = { role: 'user' | 'assistant'; content: string };

function buildPayload(sessionId: string) {
  const message = process.env.CHAT_ROUTE_MESSAGE
    || '我这两天一想到周一开会就胸口发紧，晚上也睡不好。';

  const defaultHistory: ChatTurn[] = [
    { role: 'user', content: '最近状态不太稳定。' },
    { role: 'assistant', content: '能具体说说最近最困扰你的是什么吗？' },
  ];

  const historyInput = process.env.CHAT_ROUTE_HISTORY_JSON;
  let history = defaultHistory;

  if (historyInput) {
    const parsed = JSON.parse(historyInput);
    if (
      Array.isArray(parsed)
      && parsed.every(
        (item) =>
          item
          && (item.role === 'user' || item.role === 'assistant')
          && typeof item.content === 'string'
      )
    ) {
      history = parsed as ChatTurn[];
    } else {
      throw new Error('CHAT_ROUTE_HISTORY_JSON must be a JSON array of { role, content }');
    }
  }

  return {
    message,
    history,
    sessionId,
  };
}

async function ensureTestConversation() {
  const { prisma } = await import('../lib/db/prisma');
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!user) {
    throw new Error('No user found in database; cannot create test conversation');
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      title: '[local-chat-route-test]',
      isHidden: true,
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  return conversation.id;
}

async function cleanupTestConversation(sessionId: string) {
  const { prisma } = await import('../lib/db/prisma');
  await prisma.message.deleteMany({
    where: { conversationId: sessionId },
  });

  await prisma.conversation.delete({
    where: { id: sessionId },
  });
}

async function readResponseMetrics(response: Response, startedAt: number) {
  const reader = response.body?.getReader();
  if (!reader) {
    return {
      status: response.status,
      firstChunkMs: null,
      totalMs: Date.now() - startedAt,
      preview: '',
    };
  }

  let firstChunkMs: number | null = null;
  let text = '';
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstChunkMs === null) {
      firstChunkMs = Date.now() - startedAt;
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();

  return {
    status: response.status,
    firstChunkMs,
    totalMs: Date.now() - startedAt,
    preview: text.slice(0, 400),
  };
}

async function waitForConversationArtifacts(
  sessionId: string,
  timeoutMs = Number(process.env.CHAT_ROUTE_QUALITY_WAIT_MS || 6000)
) {
  const { prisma } = await import('../lib/db/prisma');
  const startedAt = Date.now();
  let latestQuality: {
    createdAt: Date;
    model: string;
    latency: number;
    status: string;
    error: string | null;
    output: unknown;
  } | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const [assistantMessage, quality] = await Promise.all([
      prisma.message.findFirst({
        where: {
          conversationId: sessionId,
          role: 'assistant',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          content: true,
          createdAt: true,
          meta: true,
        },
      }),
      prisma.agentLog.findFirst({
        where: {
          conversationId: sessionId,
          agentName: 'quality',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          model: true,
          latency: true,
          status: true,
          error: true,
          output: true,
        },
      }),
    ]);

    if (quality) {
      latestQuality = quality;
    }

    if (assistantMessage) {
      return { assistantMessage, quality: quality || latestQuality };
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return { assistantMessage: null, quality: latestQuality };
}

async function readConversationArtifacts(sessionId: string) {
  const result = await waitForConversationArtifacts(sessionId);

  return {
    assistantReply: result.assistantMessage?.content || null,
    assistantMeta: result.assistantMessage?.meta || null,
    assistantCreatedAt: result.assistantMessage?.createdAt || null,
    quality: result.quality,
  };
}

async function main() {
  const { POST } = await import('../app/api/chat/route.ts');
  const { prisma } = await import('../lib/db/prisma');
  const sessionId = await ensureTestConversation();
  const payload = buildPayload(sessionId);

  const startedAt = Date.now();
  try {
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(req);
    const metrics = await readResponseMetrics(response, startedAt);
    const artifacts = await readConversationArtifacts(sessionId);

    console.log(JSON.stringify({
      ...metrics,
      sessionId,
      input: {
        message: payload.message,
        history: payload.history,
      },
      assistantReply: artifacts.assistantReply,
      assistantMeta: artifacts.assistantMeta,
      assistantCreatedAt: artifacts.assistantCreatedAt,
      quality: artifacts.quality,
    }, null, 2));
  } finally {
    await cleanupTestConversation(sessionId).catch((error) => {
      console.error('cleanup failed');
      console.error(error instanceof Error ? error.message : error);
    });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\nchat-route-local failed');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
