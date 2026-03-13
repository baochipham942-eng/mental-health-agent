import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
    ...(process.env.OPENROUTER_APP_TITLE ? { 'X-Title': process.env.OPENROUTER_APP_TITLE } : {}),
  };
}

async function postChatCompletions(body: Record<string, unknown>) {
  const apiKey = requireEnv('OPENROUTER_API_KEY');
  const baseUrl = process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1';

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} - ${raw}`);
  }

  return JSON.parse(raw) as any;
}

async function testGenerateText(model: string) {
  const data = await postChatCompletions({
    model,
    messages: [
      { role: 'system', content: '你是一位温和、简洁的心理支持助手。请用中文回复，控制在3句话内。' },
      { role: 'user', content: '这两天一到晚上我就很焦虑，脑子停不下来。' },
    ],
    temperature: 0.4,
    max_tokens: 180,
  });

  return data.choices?.[0]?.message?.content || '';
}

async function testGenerateStructured(model: string) {
  const data = await postChatCompletions({
    model,
    messages: [
      { role: 'system', content: '判断用户消息的风险等级。只输出JSON，格式为 {"label":"normal","reason":"...","needsValidation":true}。' },
      { role: 'user', content: '我最近很崩溃，但没有想伤害自己，只是一直睡不着，很害怕。' },
    ],
    temperature: 0,
    max_tokens: 180,
    response_format: { type: 'json_object' },
  });

  return data.choices?.[0]?.message?.content || '';
}

async function testStreamText(model: string) {
  const apiKey = requireEnv('OPENROUTER_API_KEY');
  const baseUrl = process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1';
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: '你是一位支持性倾听助手。请给用户一个自然、简短、中文的回复。' },
        { role: 'user', content: '我今天什么都不想做，感觉整个人像卡住了一样。' },
      ],
      temperature: 0.5,
      max_tokens: 180,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`OpenRouter stream API error: ${response.status} - ${raw}`);
  }

  if (!response.body) {
    throw new Error('OpenRouter stream API returned an empty body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let outputText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const dataLines = event
        .split('\n')
        .filter(line => line.startsWith('data: '))
        .map(line => line.slice(6).trim());

      for (const line of dataLines) {
        if (!line || line === '[DONE]') continue;
        const payload = JSON.parse(line);
        const delta = payload.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') {
          outputText += delta;
        }
      }
    }
  }

  return outputText;
}

async function main() {
  requireEnv('OPENROUTER_API_KEY');

  const model = process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4.1-mini';
  console.log('== OpenRouter Provider Smoke ==');
  console.log(`model=${model}`);
  console.log(`baseURL=${process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1'}`);

  console.log('\n[1/3] generateText');
  console.log(await testGenerateText(model));

  console.log('\n[2/3] generateStructured');
  console.log(await testGenerateStructured(model));

  console.log('\n[3/3] streamText');
  console.log(await testStreamText(model));

  console.log('\nOpenRouter provider smoke passed');
}

main().catch((error) => {
  console.error('\nOpenRouter provider smoke failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
