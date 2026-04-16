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

  const systemPrompt = `你是圆桌论道的总结者。你需要从多位大师的讨论中提炼精华，写一份简洁有力的总结。

格式要求：
**共识** — 大师们都认同什么（1-2 点）
**分歧** — 核心矛盾在哪里（1-2 点）
**启发** — 对读者最有价值的洞察（1-2 句话）

风格：客观、精炼、有洞察力。不超过 200 字。不要用"总结如下"之类的废话开头。`;

  const userPrompt = `话题：${topic}
模式：${mode === 'debate' ? '辩论' : '讨论'}
参与者：${mentorList}

完整讨论记录：
${discussion}`;

  // 最多重试 2 次（空响应或 API 错误）
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) {
        console.warn(`[Synthesizer] Retrying (attempt ${attempt + 1})...`);
        await new Promise(r => setTimeout(r, 1500));
      }
      const { text } = await generateText({
        model: getKimiModel(),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.6,
        maxOutputTokens: 400,
      });

      if (text && text.trim().length > 0) return text;
      console.warn(`[Synthesizer] Empty response (attempt ${attempt + 1})`);
    } catch (e) {
      console.error(`[Synthesizer] Failed (attempt ${attempt + 1}):`, e);
    }
  }

  // 兜底：基于已有回复生成一个简单总结
  const mentorNames = allReplies.map(r => r.mentorName).filter((v, i, a) => a.indexOf(v) === i);
  return `${mentorNames.join('、')}围绕「${topic}」展开了深入${mode === 'debate' ? '辩论' : '讨论'}，各自从不同视角提供了独特见解。由于网络原因，详细总结暂时无法生成，建议回顾上方各位大师的发言。`;
}
