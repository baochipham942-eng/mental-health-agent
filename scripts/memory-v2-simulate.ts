import 'dotenv/config';
const { Client } = require('pg');
import { buildMemoryFingerprint } from '../lib/memory/fingerprint';

type Role = 'user' | 'assistant';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function openrouterChat(messages: Array<{ role: Role | 'system'; content: string }>, opts?: {
  temperature?: number;
  max_tokens?: number;
  json?: boolean;
}) {
  const apiKey = requireEnv('OPENROUTER_API_KEY');
  const model = process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-5.4';
  const baseUrl = process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.max_tokens ?? 300,
      ...(opts?.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status} - ${raw}`);
  }

  const data = JSON.parse(raw);
  return data.choices?.[0]?.message?.content || '';
}

async function generateSummary(history: Array<{ role: Role; content: string }>): Promise<string> {
  return openrouterChat([
    {
      role: 'system',
      content: '请把这段心理支持对话总结成1-2句中文摘要，保留长期有价值的信息，不要啰嗦。',
    },
    {
      role: 'user',
      content: history.map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n'),
    },
  ], { temperature: 0.2, max_tokens: 180 });
}

async function extractCandidates(history: Array<{ role: Role; content: string }>): Promise<Array<{
  kind: 'trigger' | 'preference' | 'identity' | 'coping' | 'relationship';
  content: string;
  confidence: number;
}>> {
  const text = await openrouterChat([
    {
      role: 'system',
      content: [
        '你负责从心理支持对话中提取长期记忆候选。',
        '只返回 JSON，格式：{"memories":[{"kind":"trigger|preference|identity|coping|relationship","content":"...","confidence":0.9}]}',
        '只提取长期稳定或反复出现、未来对支持有帮助的信息。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: history.map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n'),
    },
  ], { temperature: 0.1, max_tokens: 300, json: true });

  const parsed = JSON.parse(text);
  return Array.isArray(parsed.memories) ? parsed.memories : [];
}

function priorityForKind(kind: string): number {
  switch (kind) {
    case 'trigger':
      return 90;
    case 'preference':
      return 80;
    case 'coping':
      return 75;
    case 'relationship':
      return 65;
    case 'identity':
    default:
      return 60;
  }
}

async function upsertProfileMemory(
  client: InstanceType<typeof Client>,
  params: {
    id: string;
    userId: string;
    conversationId: string;
    kind: string;
    content: string;
    confidence: number;
  }
) {
  const fingerprint = buildMemoryFingerprint(params.kind as any, params.content);
  const existing = await client.query(
    'SELECT id, content, confidence, fingerprint FROM "ProfileMemory" WHERE "userId" = $1 AND kind = $2 ORDER BY "updatedAt" DESC LIMIT 10',
    [params.userId, params.kind]
  );

  const row = existing.rows.find((item: any) => {
    const rowFingerprint =
      item.fingerprint || buildMemoryFingerprint(params.kind as any, String(item.content || ''));
    return rowFingerprint === fingerprint;
  });

  if (row) {
    const nextContent =
      params.content.length > String(row.content || '').length ? params.content : row.content;
    const nextConfidence = Math.max(params.confidence, Number(row.confidence || 0));
    await client.query(
      'UPDATE "ProfileMemory" SET content = $2, confidence = $3, "sourceConversationId" = $4, "lastConfirmedAt" = NOW(), fingerprint = $5, "updatedAt" = NOW() WHERE id = $1',
      [row.id, nextContent, nextConfidence, params.conversationId, fingerprint]
    );
    return;
  }

  await client.query(
    'INSERT INTO "ProfileMemory" (id, "userId", kind, fingerprint, content, priority, confidence, "sourceConversationId", "lastConfirmedAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())',
    [
      params.id,
      params.userId,
      params.kind,
      fingerprint,
      params.content,
      priorityForKind(params.kind),
      params.confidence,
      params.conversationId,
    ]
  );
}

async function main() {
  const connectionString = requireEnv('DATABASE_URL');
  const userId = process.env.MEMORY_V2_TEST_USER_ID || 'cmlly2z2r000971ly5357n2fw';
  const client = new Client({ connectionString });
  await client.connect();

  const now = Date.now();
  const conversationId = `memv2_real_${now}`;
  const history: Array<{ role: Role; content: string }> = [
    { role: 'user', content: '我最近一到晚上就会想到工作汇报，然后胸口发紧，像马上要被批评一样。' },
    { role: 'assistant', content: '听起来工作汇报已经和紧张、被否定的预期绑在一起了。' },
    { role: 'user', content: '而且我不太喜欢那种特别强势、一步步命令我的方式，我更想先被陪着理清楚。' },
  ];

  await client.query('BEGIN');
  try {
    await client.query(
      'INSERT INTO "Conversation" (id, "userId", title, status, "createdAt", "updatedAt", "isHidden") VALUES ($1, $2, $3, $4, NOW(), NOW(), false)',
      [conversationId, userId, 'memory-v2 simulate', 'ACTIVE']
    );

    for (const [index, message] of history.entries()) {
      await client.query(
        'INSERT INTO "Message" (id, "conversationId", role, content, "createdAt") VALUES ($1, $2, $3, $4, NOW() + ($5 * interval \'1 second\'))',
        [`msg_${now}_${index}`, conversationId, message.role, message.content, index]
      );
    }

    const summary = await generateSummary(history);
    const candidates = await extractCandidates(history);

    await client.query(
      'INSERT INTO "SessionSummaryV2" (id, "userId", "conversationId", summary, "createdAt") VALUES ($1, $2, $3, $4, NOW())',
      [`ssv2_${now}`, userId, conversationId, summary]
    );

    for (const [index, candidate] of candidates.entries()) {
      const candidateId = `mc_${now}_${index}`;
      await client.query(
        'INSERT INTO "MemoryCandidate" (id, "userId", "conversationId", kind, content, confidence, status, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
        [candidateId, userId, conversationId, candidate.kind, candidate.content, candidate.confidence, 'merged']
      );

      await upsertProfileMemory(client, {
        id: `pm_${now}_${index}`,
        userId,
        conversationId,
        kind: candidate.kind,
        content: candidate.content,
        confidence: candidate.confidence,
      });
    }

    await client.query('COMMIT');

    console.log(JSON.stringify({
      conversationId,
      summary,
      candidates,
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('\nMemory V2 simulate failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
