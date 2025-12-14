/**
 * Skill 验证模块
 * 校验 Skill 定义与渲染结果的合规性
 */

import { Skill, SkillRenderResult, SlotValues } from './types';
import { countChineseChars, hasMetricToken } from '../ai/assessment/sanitize';

/**
 * Skill 验证错误
 */
export interface SkillValidationError {
  /** 错误类型 */
  type: 'definition' | 'render';
  /** 错误位置 */
  location: string;
  /** 错误消息 */
  message: string;
  /** 详细信息 */
  details?: any;
}

/**
 * Skill 验证结果
 */
export interface SkillValidationResult {
  /** 是否通过 */
  valid: boolean;
  /** 错误列表 */
  errors: SkillValidationError[];
  /** 警告列表 */
  warnings: SkillValidationError[];
}

/**
 * 验证单个 Skill 定义
 */
export function validateSkillDefinition(skill: Skill): SkillValidationResult {
  const errors: SkillValidationError[] = [];
  const warnings: SkillValidationError[] = [];

  // 1. 检查必需字段
  if (!skill.id || !skill.name || !skill.templates) {
    errors.push({
      type: 'definition',
      location: 'skill',
      message: 'Skill 缺少必需字段（id/name/templates）',
    });
    return { valid: false, errors, warnings };
  }

  // 2. 检查 nextStepsLines 模板
  if (!skill.templates.nextStepsLines || skill.templates.nextStepsLines.length === 0) {
    errors.push({
      type: 'definition',
      location: 'templates.nextStepsLines',
      message: 'nextStepsLines 模板为空',
    });
  } else if (skill.templates.nextStepsLines.length > 3) {
    warnings.push({
      type: 'definition',
      location: 'templates.nextStepsLines',
      message: `nextStepsLines 模板数量过多（${skill.templates.nextStepsLines.length}条），建议2-3条`,
    });
  }

  // 3. 检查 actionCard 模板
  const actionCard = skill.templates.actionCard;
  if (!actionCard) {
    errors.push({
      type: 'definition',
      location: 'templates.actionCard',
      message: 'actionCard 模板缺失',
    });
    return { valid: false, errors, warnings };
  }

  // 4. 检查 steps 数量（必须 3-5 条）
  if (!actionCard.steps || actionCard.steps.length < 3 || actionCard.steps.length > 5) {
    errors.push({
      type: 'definition',
      location: 'templates.actionCard.steps',
      message: `steps 数量不符合要求（期望3-5条，实际${actionCard.steps.length}条）`,
      details: { count: actionCard.steps?.length || 0 },
    });
  }

  // 5. 检查槽位引用（模板中使用的槽位必须在 slots 中定义）
  const slotNames = new Set(skill.slots.map(slot => slot.name));
  const templateText = [
    ...skill.templates.nextStepsLines,
    actionCard.title,
    ...(actionCard.steps || []),
    actionCard.when,
  ].join(' ');

  // 提取所有槽位引用 {slotName}
  const slotRefs = templateText.match(/\{([^}]+)\}/g) || [];
  const referencedSlots = new Set(slotRefs.map(ref => ref.slice(1, -1)));

  for (const slotRef of referencedSlots) {
    if (!slotNames.has(slotRef)) {
      errors.push({
        type: 'definition',
        location: 'templates',
        message: `模板引用了未定义的槽位：{${slotRef}}`,
        details: { slotName: slotRef },
      });
    }
  }

  // 6. 检查槽位默认值（如果有槽位没有默认值，给出警告）
  const slotsWithoutDefault = skill.slots.filter(slot => !slot.defaultValue);
  if (slotsWithoutDefault.length > 0) {
    warnings.push({
      type: 'definition',
      location: 'slots',
      message: `部分槽位缺少默认值：${slotsWithoutDefault.map(s => s.name).join(', ')}`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证 Skill 渲染结果
 */
export function validateSkillRenderResult(
  skill: Skill,
  renderResult: SkillRenderResult,
  slotValues: SlotValues
): SkillValidationResult {
  const errors: SkillValidationError[] = [];
  const warnings: SkillValidationError[] = [];

  // 1. 验证 nextStepsLines
  if (!renderResult.nextStepsLines || renderResult.nextStepsLines.length === 0) {
    errors.push({
      type: 'render',
      location: 'nextStepsLines',
      message: 'nextStepsLines 为空',
    });
  } else {
    if (renderResult.nextStepsLines.length < 2 || renderResult.nextStepsLines.length > 3) {
      warnings.push({
        type: 'render',
        location: 'nextStepsLines',
        message: `nextStepsLines 数量不符合推荐（期望2-3条，实际${renderResult.nextStepsLines.length}条）`,
      });
    }

    // 验证每条 nextStepsLine 的格式
    renderResult.nextStepsLines.forEach((line, idx) => {
      // 检查是否包含触发器
      const hasTrigger = /(当|如果|一旦|当.*时|如果.*就|每晚|白天|本周)/.test(line);
      // 检查是否包含次数/时长
      const hasMetric = /\d+/.test(line);
      // 检查是否包含完成标准
      const hasCompletion = /(完成标准|至少|至少.*次|至少.*天|至少.*晚)/.test(line);

      if (!hasTrigger) {
        warnings.push({
          type: 'render',
          location: `nextStepsLines[${idx}]`,
          message: `缺少触发器（当/如果/每晚等）`,
          details: { line },
        });
      }

      if (!hasMetric) {
        errors.push({
          type: 'render',
          location: `nextStepsLines[${idx}]`,
          message: `缺少次数/时长指标`,
          details: { line },
        });
      }

      if (!hasCompletion) {
        warnings.push({
          type: 'render',
          location: `nextStepsLines[${idx}]`,
          message: `缺少完成标准（至少...次/天/晚）`,
          details: { line },
        });
      }
    });
  }

  // 2. 验证 actionCard
  const actionCard = renderResult.actionCard;
  if (!actionCard) {
    errors.push({
      type: 'render',
      location: 'actionCard',
      message: 'actionCard 缺失',
    });
    return { valid: false, errors, warnings };
  }

  // 3. 验证 steps 数量（必须 3-5 条）
  if (!actionCard.steps || actionCard.steps.length < 3 || actionCard.steps.length > 5) {
    errors.push({
      type: 'render',
      location: 'actionCard.steps',
      message: `steps 数量不符合要求（期望3-5条，实际${actionCard.steps.length}条）`,
      details: { count: actionCard.steps?.length || 0 },
    });
  } else {
    // 验证每条 step
    actionCard.steps.forEach((step, idx) => {
      const stepText = step.trim();

      // 3.1 检查长度（≤16个汉字）
      const charCount = countChineseChars(stepText);
      if (charCount > 16) {
        errors.push({
          type: 'render',
          location: `actionCard.steps[${idx}]`,
          message: `步骤长度超限（${charCount}字 > 16字）`,
          details: { step: stepText, charCount },
        });
      }

      // 3.2 检查是否包含时长/次数/触发器（使用 sanitize 的逻辑）
      if (!hasMetricToken(stepText)) {
        errors.push({
          type: 'render',
          location: `actionCard.steps[${idx}]`,
          message: `步骤缺少时长/次数/触发器`,
          details: { step: stepText },
        });
      }

      // 3.3 检查"写下/记录/标记/思考/列出/整理"类动作是否包含次数/时长
      const actionVerbs = ['写下', '记录', '标记', '思考', '列出', '整理'];
      const hasActionVerb = actionVerbs.some(verb => stepText.includes(verb));

      if (hasActionVerb) {
        // 检查是否包含次数或时长
        const hasExplicitCount = /×\s*\d+\s*次/.test(stepText) || /\d+\s*次/.test(stepText);
        const hasExplicitDuration = /\d+\s*(分钟|小时|天|周|秒)/.test(stepText);

        if (!hasExplicitCount && !hasExplicitDuration) {
          errors.push({
            type: 'render',
            location: `actionCard.steps[${idx}]`,
            message: `"写下/记录/标记"类步骤必须包含次数或时长`,
            details: { step: stepText },
          });
        }
      }

      // 3.4 检查是否包含抽象句（如果包含抽象关键词但没有指标，给出警告）
      const abstractKeywords = ['保持', '持续进行', '直到', '维持', '继续'];
      const isAbstract = abstractKeywords.some(keyword => stepText.includes(keyword));
      const hasMetricInStep = hasMetricToken(stepText);

      if (isAbstract && !hasMetricInStep) {
        errors.push({
          type: 'render',
          location: `actionCard.steps[${idx}]`,
          message: `步骤为抽象句且缺少指标`,
          details: { step: stepText },
        });
      }
    });
  }

  // 4. 验证 title 和 when
  if (!actionCard.title || actionCard.title.trim().length === 0) {
    errors.push({
      type: 'render',
      location: 'actionCard.title',
      message: 'title 为空',
    });
  }

  if (!actionCard.when || actionCard.when.trim().length === 0) {
    errors.push({
      type: 'render',
      location: 'actionCard.when',
      message: 'when 为空',
    });
  }

  // 5. 验证 effort
  if (!['low', 'medium', 'high'].includes(actionCard.effort)) {
    errors.push({
      type: 'render',
      location: 'actionCard.effort',
      message: `effort 值无效（期望 low/medium/high，实际 ${actionCard.effort}）`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证所有 Skills（定义层面）
 */
export function validateAllSkills(skills: Skill[]): SkillValidationResult {
  const allErrors: SkillValidationError[] = [];
  const allWarnings: SkillValidationError[] = [];

  for (const skill of skills) {
    const result = validateSkillDefinition(skill);
    allErrors.push(
      ...result.errors.map(err => ({
        ...err,
        location: `${skill.id}.${err.location}`,
      }))
    );
    allWarnings.push(
      ...result.warnings.map(warn => ({
        ...warn,
        location: `${skill.id}.${warn.location}`,
      }))
    );
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
