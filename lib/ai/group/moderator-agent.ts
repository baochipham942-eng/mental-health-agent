/**
 * Moderator Agent — 圆桌论道主持人
 *
 * 职责：
 * 1. 开场引导：介绍话题和参与大师，设定基调
 * 2. 动态点名：根据讨论内容决定下一位发言者
 * 3. 挖掘分歧：识别大师之间的观点冲突并引导交锋
 * 4. 收敛总结：在合适时机推动讨论收敛
 */

import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { deepseek, DEEPSEEK_MODEL } from '../deepseek';
import { MentorPersona } from '../mentors/personas';
import { GroupMode } from './orchestrator';

// 主持人决策：下一步该谁发言
const NextSpeakerSchema = z.object({
  nextSpeakerId: z.string().describe('下一位应该发言的大师 ID'),
  reason: z.string().describe('为什么选择这位大师发言（一句话）'),
  prompt: z.string().describe('给这位大师的引导语，例如"荣格，你似乎不同意阿德勒的观点？"'),
  shouldContinue: z.boolean().describe('讨论是否还应继续（false 表示可以进入总结阶段）'),
});

export type NextSpeakerDecision = z.infer<typeof NextSpeakerSchema>;

// 主持人开场白
export async function generateOpening(
  mentors: MentorPersona[],
  mode: GroupMode,
  topic: string,
  userInsights?: string[],
): Promise<string> {
  const mentorList = mentors
    .map(m => `${m.avatar} ${m.name}（${m.title}）`)
    .join('、');

  const modeLabel = mode === 'debate' ? '辩论' : '讨论';

  const insightBlock = userInsights && userInsights.length > 0
    ? `\n这位朋友此前在这里聊过的一些背景（仅供你理解TA，可以用一句话自然带出延续感，例如"上次聊到……"，但不要罗列细节、不要让TA觉得被档案化）：\n${userInsights.slice(0, 3).map(i => `- ${i}`).join('\n')}`
    : '';

  const { text } = await generateText({
    model: deepseek(DEEPSEEK_MODEL),
    system: `你是一位优雅睿智的圆桌论道主持人。你的风格简洁有力，善于用一两句话点燃话题。
不要说废话，不要自我介绍。直接引出话题和第一位发言者。
控制在 80 字以内。`,
    prompt: `今天的${modeLabel}话题是：「${topic}」
参与的大师有：${mentorList}${insightBlock}
请写一段开场白，引出话题并点名第一位发言者。`,
    temperature: 0.8,
    maxOutputTokens: 150,
  });

  return text;
}

// 主持人动态决定下一位发言者
export async function decideNextSpeaker(
  mentors: MentorPersona[],
  mode: GroupMode,
  topic: string,
  currentRoundReplies: Array<{ mentorId: string; mentorName: string; content: string }>,
  remainingMentors: string[],
  roundNumber: number,
): Promise<NextSpeakerDecision> {
  const recentDiscussion = currentRoundReplies
    .map(r => `[${r.mentorName}]: ${r.content}`)
    .join('\n\n');

  const availableMentors = mentors
    .filter(m => remainingMentors.includes(m.id))
    .map(m => `- ${m.id}: ${m.name}（${m.title}，${m.description}）`)
    .join('\n');

  const { object } = await generateObject({
    model: deepseek(DEEPSEEK_MODEL),
    schema: NextSpeakerSchema,
    system: `你是圆桌论道的主持人。你的职责是根据讨论走向，选择最合适的下一位发言者。
选择标准：
1. 优先选与当前话题有"张力"的大师（观点可能冲突）
2. 避免让同一流派连续发言
3. 如果有大师被点名或观点被质疑，优先让其回应
4. 第 ${roundNumber} 轮讨论${roundNumber >= 3 ? '，考虑是否该收敛了' : ''}`,
    prompt: `话题：${topic}
模式：${mode === 'debate' ? '辩论（鼓励交锋）' : '讨论（鼓励补充）'}
当前第 ${roundNumber} 轮

已发言内容：
${recentDiscussion || '（还没有人发言）'}

可选的下一位发言者：
${availableMentors}

请选择下一位发言者。`,
    temperature: 0.5,
  });

  return object;
}

// 主持人轮间过渡语
export async function generateTransition(
  _mentors: MentorPersona[],
  topic: string,
  previousRoundReplies: Array<{ mentorName: string; content: string }>,
  roundNumber: number,
): Promise<{ transition: string; shouldEnd: boolean }> {
  const summary = previousRoundReplies
    .map(r => `[${r.mentorName}]: ${r.content.slice(0, 100)}...`)
    .join('\n');

  const { text } = await generateText({
    model: deepseek(DEEPSEEK_MODEL),
    system: `你是圆桌论道主持人。上一轮讨论刚结束，你需要：
1. 用一两句话点评上一轮的亮点或核心分歧
2. 引导进入下一轮，或者判断讨论已经充分可以总结了

如果觉得讨论应该结束，在回复末尾加上 [END]。
控制在 60 字以内。当前是第 ${roundNumber} 轮。`,
    prompt: `话题：${topic}
上一轮讨论：
${summary}`,
    temperature: 0.7,
    maxOutputTokens: 120,
  });

  const shouldEnd = text.includes('[END]') || roundNumber >= 3;
  const transition = text.replace('[END]', '').trim();

  return { transition, shouldEnd };
}
