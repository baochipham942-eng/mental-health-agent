require('dotenv/config');
require('./register-alias');
require('ts-node/register/transpile-only');

const { NextRequest } = require('next/server');
const { POST } = require('../app/api/chat/route.ts');

async function readResponseMetrics(response, startedAt) {
  const reader = response.body?.getReader();
  if (!reader) {
    return {
      status: response.status,
      firstChunkMs: null,
      totalMs: Date.now() - startedAt,
      preview: '',
    };
  }

  let firstChunkMs = null;
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

async function main() {
  const payload = {
    message: '我这两天一想到周一开会就胸口发紧，晚上也睡不好。',
    history: [
      { role: 'user', content: '最近状态不太稳定。' },
      { role: 'assistant', content: '能具体说说最近最困扰你的是什么吗？' },
    ],
    sessionId: 'latency-test-session',
  };

  const startedAt = Date.now();
  const req = new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const response = await POST(req);
  const metrics = await readResponseMetrics(response, startedAt);

  console.log(JSON.stringify(metrics, null, 2));
}

main().catch((error) => {
  console.error('\nchat-route-local failed');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
