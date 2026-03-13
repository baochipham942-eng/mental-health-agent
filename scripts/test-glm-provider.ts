import 'dotenv/config';
import { z } from 'zod';
import { generateStructured, generateText, streamText, type ChatMessage } from '../lib/llm';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function testGenerateText() {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: '你是一位温和、简洁的心理支持助手。请用中文回复，控制在3句话内。',
    },
    {
      role: 'user',
      content: '我这两天总觉得胸口发紧，晚上也睡不好，有点慌。',
    },
  ];

  const result = await generateText(messages, {
    provider: 'glm',
    temperature: 0.4,
    max_tokens: 180,
  });

  return result.reply;
}

async function testGenerateStructured() {
  const schema = z.object({
    label: z.enum(['crisis', 'urgent', 'normal']),
    reason: z.string(),
    needsValidation: z.boolean(),
  });

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: '判断用户消息的风险等级。仅输出JSON。',
    },
    {
      role: 'user',
      content: '我最近很崩溃，但没有想伤害自己，只是一直睡不着，很害怕。',
    },
  ];

  return generateStructured(messages, schema, {
    provider: 'glm',
    temperature: 0,
    max_tokens: 180,
  });
}

async function testStreamText() {
  const chunks: string[] = [];

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: '你是一位支持性倾听助手。请给用户一个自然、简短、中文的回复。',
    },
    {
      role: 'user',
      content: '我今天什么都不想做，感觉整个人像卡住了一样。',
    },
  ];

  const result = await streamText(messages, {
    provider: 'glm',
    temperature: 0.5,
    max_tokens: 180,
  });

  for await (const chunk of result.textStream) {
    chunks.push(chunk);
  }

  return chunks.join('');
}

async function main() {
  requireEnv('GLM_API_KEY');

  console.log('== GLM Provider Smoke ==');
  console.log(`model=${process.env.GLM_CHAT_MODEL || 'glm-5'}`);
  console.log(`baseURL=${process.env.GLM_API_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'}`);

  console.log('\n[1/3] generateText');
  const textReply = await testGenerateText();
  console.log(textReply);

  console.log('\n[2/3] generateStructured');
  const structured = await testGenerateStructured();
  console.log(JSON.stringify(structured, null, 2));

  console.log('\n[3/3] streamText');
  const streamed = await testStreamText();
  console.log(streamed);

  console.log('\nGLM provider smoke passed');
}

main().catch((error) => {
  console.error('\nGLM provider smoke failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
