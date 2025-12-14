/**
 * Skill 系统结构契约验证
 * 统一的验证函数，供 smoke、单测、运行时 gate 使用
 */

import { ActionCard } from '@/types/chat';
import { countChineseChars, hasMetricToken } from '../ai/assessment/sanitize';

/**
 * 契约验证错误
 */
export interface ContractValidationError {
  /** 错误类型 */
  type: 'actionCards_count' | 'steps_count' | 'step_length' | 'step_metric' | 'nextSteps_count' | 'nextSteps_format';
  /** 错误位置 */
  location: string;
  /** 错误消息 */
  message: string;
  /** 详细信息 */
  details?: any;
}

/**
 * 契约验证结果
 */
export interface ContractValidationResult {
  /** 是否通过 */
  pass: boolean;
  /** 错误列表 */
  errors: ContractValidationError[];
}

/**
 * 验证 actionCards 结构契约
 * @param actionCards actionCards 数组
 * @returns 验证结果
 */
export function validateActionCardsContract(actionCards: ActionCard[]): ContractValidationResult {
  const errors: ContractValidationError[] = [];

  // 1. actionCards 数量必须 = 2
  if (!actionCards || actionCards.length === 0) {
    errors.push({
      type: 'actionCards_count',
      location: 'actionCards',
      message: 'actionCards 为空',
    });
    return { pass: false, errors };
  }

  if (actionCards.length !== 2) {
    errors.push({
      type: 'actionCards_count',
      location: 'actionCards',
      message: `actionCards 数量不符合要求（期望2张，实际${actionCards.length}张）`,
      details: { expected: 2, actual: actionCards.length },
    });
  }

  // 2. 验证每张卡
  actionCards.forEach((card, cardIdx) => {
    if (!card.steps || !Array.isArray(card.steps)) {
      errors.push({
        type: 'steps_count',
        location: `actionCards[${cardIdx}]`,
        message: `卡片 ${cardIdx + 1} 缺少 steps 数组`,
      });
      return;
    }

    // 2.1 每张卡 steps 必须 3-5 条
    if (card.steps.length < 3 || card.steps.length > 5) {
      errors.push({
        type: 'steps_count',
        location: `actionCards[${cardIdx}].steps`,
        message: `卡片 ${cardIdx + 1} steps 数量不符合要求（期望3-5条，实际${card.steps.length}条）`,
        details: { cardIndex: cardIdx + 1, expected: '3-5', actual: card.steps.length },
      });
    }

    // 2.2 验证每条 step
    card.steps.forEach((step, stepIdx) => {
      const stepText = step.trim();

      // 2.2.1 每条 step ≤16 汉字
      const charCount = countChineseChars(stepText);
      if (charCount > 16) {
        errors.push({
          type: 'step_length',
          location: `actionCards[${cardIdx}].steps[${stepIdx}]`,
          message: `卡片 ${cardIdx + 1} 步骤 ${stepIdx + 1} 超出长度限制（${charCount}字 > 16字）`,
          details: { cardIndex: cardIdx + 1, stepIndex: stepIdx + 1, step: stepText, charCount },
        });
      }

      // 2.2.2 每条 step 必须包含时长/次数/触发器
      if (!hasMetricToken(stepText)) {
        errors.push({
          type: 'step_metric',
          location: `actionCards[${cardIdx}].steps[${stepIdx}]`,
          message: `卡片 ${cardIdx + 1} 步骤 ${stepIdx + 1} 缺少时长/次数/触发器`,
          details: { cardIndex: cardIdx + 1, stepIndex: stepIdx + 1, step: stepText },
        });
      }
    });
  });

  return {
    pass: errors.length === 0,
    errors,
  };
}

/**
 * 验证 nextStepsLines 结构契约
 * @param nextStepsLines nextStepsLines 数组
 * @returns 验证结果
 */
export function validateNextStepsLinesContract(nextStepsLines: string[]): ContractValidationResult {
  const errors: ContractValidationError[] = [];

  if (!nextStepsLines || !Array.isArray(nextStepsLines)) {
    errors.push({
      type: 'nextSteps_count',
      location: 'nextStepsLines',
      message: 'nextStepsLines 不是数组或为空',
    });
    return { pass: false, errors };
  }

  // 1. nextStepsLines 数量必须 2-3 条
  if (nextStepsLines.length < 2 || nextStepsLines.length > 3) {
    errors.push({
      type: 'nextSteps_count',
      location: 'nextStepsLines',
      message: `nextStepsLines 数量不符合要求（期望2-3条，实际${nextStepsLines.length}条）`,
      details: { expected: '2-3', actual: nextStepsLines.length },
    });
  }

  // 2. 验证每条 nextStepsLine 的格式
  nextStepsLines.forEach((line, idx) => {
    const lineText = line.trim();

    // 2.0 拆分主句部分和完成标准部分
    // 匹配 "；完成标准：" 或 ";完成标准:" 或 "完成标准："（注意中英文分号和冒号）
    const completionMatch = lineText.match(/([；;]?\s*完成标准[：:])/);
    let leftPart = lineText;
    let rightPart = '';
    
    if (completionMatch) {
      const splitIndex = completionMatch.index! + completionMatch[0].length;
      leftPart = lineText.substring(0, completionMatch.index!).trim();
      rightPart = lineText.substring(splitIndex).trim();
    }

    // 2.1 检查是否包含触发器（在整个 lineText 中检查）
    // 使用非贪婪匹配避免冗余，优先匹配完整短语（当...时、如果...就），再匹配单字（当、如果）
    // 这样写更稳：先匹配完整模式，避免单字模式过早匹配导致语义丢失
    const hasTrigger = /(当.*?时|如果.*?就|一旦|每晚|白天|本周|每天|当|如果)/.test(lineText);
    
    // 2.2 检查是否包含时长或次数（只在 leftPart 中检查）
    // 支持多种时长/次数表达，拆成多个条件提高可维护性
    // 这样写更可维护：每个规则独立，便于后续扩展和调试
    const hasMetric = (
      /持续\d+(天|周|晚|分钟|小时)/.test(leftPart) ||  // 持续X天/周/晚/分钟/小时
      /\d+(分钟|小时)/.test(leftPart) ||                // X分钟/小时
      /每次\d+(分钟|小时)/.test(leftPart) ||            // 每次X分钟/小时
      /×\d+次/.test(leftPart) ||                        // ×X次
      /\d+次/.test(leftPart) ||                         // X次（如"做3次"）
      /(每天|每周|每晚)\d+次/.test(leftPart)            // 每天/每周/每晚X次
    );
    
    // 2.3 检查是否包含完成标准（在整个 lineText 中检查）
    const hasCompletion = /(完成标准|至少|至少.*次|至少.*天|至少.*晚|至少.*周)/.test(lineText);

    if (!hasTrigger) {
      errors.push({
        type: 'nextSteps_format',
        location: `nextStepsLines[${idx}]`,
        message: `nextStepsLines[${idx}] 缺少触发器（当/如果/每晚等）`,
        details: { index: idx, line: lineText },
      });
    }

    if (!hasMetric) {
      errors.push({
        type: 'nextSteps_format',
        location: `nextStepsLines[${idx}]`,
        message: `nextStepsLines[${idx}] 缺少时长或次数`,
        details: { index: idx, line: lineText },
      });
    }

    if (!hasCompletion) {
      errors.push({
        type: 'nextSteps_format',
        location: `nextStepsLines[${idx}]`,
        message: `nextStepsLines[${idx}] 缺少完成标准（至少...次/天/晚）`,
        details: { index: idx, line: lineText },
      });
    }
  });

  return {
    pass: errors.length === 0,
    errors,
  };
}

/**
 * 验证完整的 Skill 输出契约（actionCards + nextStepsLines）
 * @param actionCards actionCards 数组
 * @param nextStepsLines nextStepsLines 数组
 * @returns 验证结果
 */
export function validateSkillOutputContract(
  actionCards: ActionCard[],
  nextStepsLines: string[]
): ContractValidationResult {
  const actionCardsResult = validateActionCardsContract(actionCards);
  const nextStepsResult = validateNextStepsLinesContract(nextStepsLines);

  return {
    pass: actionCardsResult.pass && nextStepsResult.pass,
    errors: [...actionCardsResult.errors, ...nextStepsResult.errors],
  };
}
