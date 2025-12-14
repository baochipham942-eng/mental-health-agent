/**
 * Skill 渲染模块
 * 填槽并输出 nextStepsLines 和 actionCards
 */

import { Skill, SkillRenderResult, SlotValues } from './types';
import { getSkillById } from './registry';
import { countChineseChars } from '../ai/assessment/sanitize';

/**
 * 填槽：将模板字符串中的 {slotName} 替换为实际值
 */
function fillSlot(template: string, slotValues: SlotValues): string {
  let filled = template;

  // 替换所有槽位引用 {slotName}
  const slotRefPattern = /\{([^}]+)\}/g;
  filled = filled.replace(slotRefPattern, (match, slotName) => {
    const value = slotValues[slotName];
    if (value !== undefined) {
      return String(value);
    }
    // 如果槽位值不存在，保留占位符（或返回空字符串）
    return match;
  });

  return filled;
}

/**
 * 渲染单个 Skill
 */
export function renderSkill(skill: Skill, slotValues: SlotValues): SkillRenderResult {
  // 填充 nextStepsLines
  const nextStepsLines = skill.templates.nextStepsLines.map(template => fillSlot(template, slotValues));

  // 填充 actionCard
  const actionCard = {
    title: fillSlot(skill.templates.actionCard.title, slotValues),
    steps: skill.templates.actionCard.steps.map(template => fillSlot(template, slotValues)),
    when: fillSlot(skill.templates.actionCard.when, slotValues),
    effort: skill.templates.actionCard.effort,
  };

  return {
    nextStepsLines,
    actionCard,
  };
}

/**
 * 渲染多个 Skills（用于生成最终的输出）
 */
export interface RenderedSkillsOutput {
  /** 下一步清单（2-3条，合并所有 skills 的 nextStepsLines） */
  nextStepsLines: string[];
  /** ActionCards（2张） */
  actionCards: Array<{
    title: string;
    steps: string[];
    when: string;
    effort: 'low' | 'medium' | 'high';
  }>;
}

/**
 * 渲染多个 Skills
 */
export function renderSkills(skillSelections: Array<{ skillId: string; slotValues: SlotValues }>): RenderedSkillsOutput {
  const nextStepsLines: string[] = [];
  const actionCards: Array<{
    title: string;
    steps: string[];
    when: string;
    effort: 'low' | 'medium' | 'high';
  }> = [];

  for (const selection of skillSelections) {
    const skill = getSkillById(selection.skillId);
    if (!skill) {
      console.warn(`Skill not found: ${selection.skillId}`);
      continue;
    }

    const renderResult = renderSkill(skill, selection.slotValues);

    // 合并 nextStepsLines
    nextStepsLines.push(...renderResult.nextStepsLines);

    // 添加 actionCard
    actionCards.push(renderResult.actionCard);
  }

  // 确保 nextStepsLines 数量在 2-3 条
  let finalNextStepsLines = nextStepsLines.slice(0, 3);
  if (finalNextStepsLines.length < 2 && nextStepsLines.length > 0) {
    // 如果不足 2 条，至少保留已有的
    finalNextStepsLines = nextStepsLines.slice(0, Math.min(2, nextStepsLines.length));
  }

  // 确保 actionCards 数量 = 2
  if (actionCards.length > 2) {
    // 如果超过 2 张，只保留前 2 张
    actionCards.splice(2);
  } else if (actionCards.length < 2) {
    // 如果不足 2 张，使用默认技能填充
    const defaultSkill = getSkillById('breathing-relaxation');
    if (defaultSkill && actionCards.length === 0) {
      const defaultRender = renderSkill(defaultSkill, {});
      actionCards.push(defaultRender.actionCard);
    }
    // 如果还是不足，复制最后一张
    while (actionCards.length < 2 && actionCards.length > 0) {
      actionCards.push({ ...actionCards[actionCards.length - 1] });
    }
  }

  return {
    nextStepsLines: finalNextStepsLines,
    actionCards,
  };
}
