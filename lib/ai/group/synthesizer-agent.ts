/**
 * Synthesizer Agent — 总结者
 *
 * 在多轮辩论/讨论结束后，提炼核心洞察：
 * 1. 共识点：所有大师都认同的观点
 * 2. 分歧点：大师之间的核心矛盾
 * 3. 启发：对用户最有价值的 takeaway
 */

import { generateText } from 'ai';
import { getKimiModel } from '../kimi';
import { MentorPersona } from '../mentors/personas';
import { GroupMode } from './orchestrator';

export interface SynthesisResult {
  text: string;
}

export async function synthesize(
  mentors: MentorPersona[],
  mode: GroupMode,
  topic: string,
  allReplies: Array<{ mentorName: string; mentorId: string; content: string; round: number }>,
): Promise<string> {
  const discussion = allReplies
    .map(r => `[第${r.round}轮 ${r.mentorName}]: ${r.content}`)
    .join('\n\n');

  const mentorList = mentors.map(m => `${m.avatar} ${m.name}`).join('、');

  const { text } = await generateText({
    model: getKimiModel(),
    system: `你是圆桌论道的总结者。你需要从多位大师的讨论中提炼精华，写一份简洁有力的总结。

格式要求：
**共识** — 大师们都认同什么（1-2 点）
**分歧** — 核心矛盾在哪里（1-2 点）
**启发** — 对读者最有价值的洞察（1-2 句话）

风格：客观、精炼、有洞察力。不超过 200 字。不要用"总结如下"之类的废话开头。`,
    prompt: `话题：${topic}
模式：${mode === 'debate' ? '辩论' : '讨论'}
参与者：${mentorList}

完整讨论记录：
${discussion}`,
    temperature: 0.6,
    maxTokens: 400,
  });

  return text;
}
