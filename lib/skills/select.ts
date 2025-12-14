/**
 * Skill 选择模块
 * 基于规则选择适合的 Skills（规则优先，尽量 deterministic）
 */

import { Skill, SkillSelectionContext, SkillSelection } from './types';
import { getAllSkills } from './registry';

/**
 * 从上下文推断风险等级
 */
function inferRiskLevel(context: SkillSelectionContext): 'low' | 'medium' | 'high' | 'crisis' {
  if (context.riskLevel === 'crisis') {
    return 'crisis';
  }

  // 如果有自伤念头，升级风险
  if (context.hasRiskThoughts) {
    if (context.impact >= 8) {
      return 'crisis';
    }
    if (context.impact >= 6) {
      return 'high';
    }
    return 'medium';
  }

  // 基于影响程度和持续时间判断
  if (context.impact >= 7) {
    if (context.duration === 'weeks' || context.duration === 'months') {
      return 'high';
    }
    return 'medium';
  }

  if (context.impact >= 4) {
    return 'medium';
  }

  return 'low';
}

/**
 * 检查 Skill 是否适用于上下文
 */
function isSkillApplicable(skill: Skill, context: SkillSelectionContext): boolean {
  const { applicability } = skill;

  // 检查风险等级
  if (applicability.riskLevels && applicability.riskLevels.length > 0) {
    const actualRiskLevel = inferRiskLevel(context);
    if (!applicability.riskLevels.includes(actualRiskLevel)) {
      return false;
    }
  }

  // 检查情绪类型
  if (applicability.emotions && applicability.emotions.length > 0) {
    if (!applicability.emotions.includes(context.emotion)) {
      return false;
    }
  }

  // 检查最小影响程度
  if (applicability.minImpact !== undefined) {
    if (context.impact < applicability.minImpact) {
      return false;
    }
  }

  // 检查持续时间（如果需要）
  if (applicability.minDuration) {
    const durationOrder: Record<string, number> = {
      days: 1,
      weeks: 2,
      months: 3,
      uncertain: 0,
    };
    const requiredOrder = durationOrder[applicability.minDuration] || 0;
    const actualOrder = durationOrder[context.duration] || 0;
    if (actualOrder < requiredOrder) {
      return false;
    }
  }

  // 检查是否需要风险信息
  if (applicability.requiresRiskInfo && context.hasRiskThoughts === undefined) {
    return false;
  }

  return true;
}

/**
 * 计算 Skill 的匹配分数（用于排序）
 */
function calculateMatchScore(skill: Skill, context: SkillSelectionContext): number {
  let score = 0;

  const actualRiskLevel = inferRiskLevel(context);

  // 风险等级匹配加分
  if (skill.applicability.riskLevels?.includes(actualRiskLevel)) {
    score += 10;
  }

  // 情绪类型匹配加分
  if (skill.applicability.emotions?.includes(context.emotion)) {
    score += 5;
  }

  // 影响程度匹配加分（越接近 minImpact 越好）
  if (skill.applicability.minImpact !== undefined) {
    const diff = context.impact - skill.applicability.minImpact;
    if (diff >= 0 && diff <= 2) {
      score += 3;
    }
  }

  // 标签匹配加分（稳定化类优先）
  if (skill.tags.includes('grounding') || skill.tags.includes('self-care')) {
    score += 2;
  }

  return score;
}

/**
 * 生成槽位默认值
 */
function generateSlotValues(skill: Skill, context: SkillSelectionContext): Record<string, string | number> {
  const slotValues: Record<string, string | number> = {};

  for (const slot of skill.slots) {
    // 如果已经有值，跳过
    if (slotValues[slot.name] !== undefined) {
      continue;
    }

    // 使用默认值
    if (slot.defaultValue !== undefined) {
      slotValues[slot.name] = slot.defaultValue;
    } else {
      // 根据槽位类型和上下文生成值
      switch (slot.type) {
        case 'count':
          slotValues[slot.name] = 1;
          break;
        case 'number':
          slotValues[slot.name] = 3;
          break;
        case 'duration':
          slotValues[slot.name] = '7';
          break;
        case 'string':
          slotValues[slot.name] = '当需要时';
          break;
        default:
          slotValues[slot.name] = '';
      }
    }

    // 根据上下文调整特定槽位
    if (slot.name === 'triggerTime') {
      if (context.emotion === 'anxiety' || context.emotion === 'fear') {
        slotValues[slot.name] = '当焦虑情绪出现时';
      } else if (context.emotion === 'depression') {
        slotValues[slot.name] = '每晚睡前';
      } else {
        slotValues[slot.name] = '白天任意时段';
      }
    }
  }

  return slotValues;
}

/**
 * 选择 Skills（返回 2 个）
 * @param context 选择上下文
 * @returns 选中的 Skills（2 个）
 */
export function selectSkills(context: SkillSelectionContext): SkillSelection[] {
  const allSkills = getAllSkills();

  // 1. 筛选适用的 Skills
  const applicableSkills = allSkills.filter(skill => isSkillApplicable(skill, context));

  if (applicableSkills.length === 0) {
    // 如果没有适用的，返回默认的稳定化技能
    const defaultSkills = allSkills.filter(skill =>
      skill.tags.includes('grounding') || skill.tags.includes('self-care')
    );
    if (defaultSkills.length >= 2) {
      return defaultSkills.slice(0, 2).map(skill => ({
        skillId: skill.id,
        reason: '默认稳定化技能（无其他适用技能）',
        slotValues: generateSlotValues(skill, context),
      }));
    }
    // 如果还不够，返回前2个
    return allSkills.slice(0, Math.min(2, allSkills.length)).map(skill => ({
      skillId: skill.id,
      reason: '默认技能（无适用技能）',
      slotValues: generateSlotValues(skill, context),
    }));
  }

  // 2. 按匹配分数排序
  const sortedSkills = applicableSkills
    .map(skill => ({
      skill,
      score: calculateMatchScore(skill, context),
    }))
    .sort((a, b) => b.score - a.score);

  // 3. 选择策略：优先选择不同类型的技能组合
  const selected: SkillSelection[] = [];
  const selectedCategories = new Set<string>();

  // 第一选择：稳定化/练习类（breathing, mindfulness, grounding）
  const stabilizationSkills = sortedSkills.filter(
    ({ skill }) =>
      skill.tags.includes('breathing') ||
      skill.tags.includes('mindfulness') ||
      skill.tags.includes('grounding') ||
      skill.tags.includes('self-care')
  );

  if (stabilizationSkills.length > 0) {
    const first = stabilizationSkills[0];
    selected.push({
      skillId: first.skill.id,
      reason: `稳定化技能（风险：${inferRiskLevel(context)}，情绪：${context.emotion}，影响：${context.impact}/10）`,
      slotValues: generateSlotValues(first.skill, context),
    });
    selectedCategories.add('stabilization');
  }

  // 第二选择：记录/追踪类 或 求助/就医类（根据风险等级）
  const actualRiskLevel = inferRiskLevel(context);
  let secondChoice: typeof sortedSkills[0] | null = null;

  if (actualRiskLevel === 'high' || actualRiskLevel === 'crisis') {
    // 高风险：优先选择求助/就医类
    const supportSkills = sortedSkills.filter(
      ({ skill }) => skill.tags.includes('support') || skill.tags.includes('medical') || skill.tags.includes('urgent')
    );
    if (supportSkills.length > 0) {
      secondChoice = supportSkills[0];
    }
  }

  // 如果还没选择第二个，选择记录/追踪类
  if (!secondChoice) {
    const trackingSkills = sortedSkills.filter(
      ({ skill }) => skill.tags.includes('tracking') || skill.tags.includes('journaling')
    );
    if (trackingSkills.length > 0) {
      secondChoice = trackingSkills[0];
    }
  }

  // 如果还没选择，选择评分最高的
  if (!secondChoice) {
    for (const { skill } of sortedSkills) {
      if (selected.find(s => s.skillId === skill.id)) {
        continue;
      }
      secondChoice = { skill, score: calculateMatchScore(skill, context) };
      break;
    }
  }

  if (secondChoice) {
    selected.push({
      skillId: secondChoice.skill.id,
      reason: `支持技能（风险：${inferRiskLevel(context)}，情绪：${context.emotion}）`,
      slotValues: generateSlotValues(secondChoice.skill, context),
    });
  }

  // 确保返回 2 个
  if (selected.length < 2 && sortedSkills.length >= 2) {
    // 补充第二个
    for (const { skill } of sortedSkills) {
      if (selected.find(s => s.skillId === skill.id)) {
        continue;
      }
      selected.push({
        skillId: skill.id,
        reason: `补充技能（风险：${inferRiskLevel(context)}，情绪：${context.emotion}）`,
        slotValues: generateSlotValues(skill, context),
      });
      if (selected.length >= 2) {
        break;
      }
    }
  }

  return selected.slice(0, 2);
}
