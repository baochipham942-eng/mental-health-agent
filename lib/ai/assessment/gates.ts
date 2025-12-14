import { countChineseChars, hasMetricToken } from './sanitize';
import { validateActionCardsContract, validateNextStepsLinesContract } from '../../skills/contract';

/**
 * 门禁校验结果
 */
export type GateResult = {
  pass: boolean;
  missing: string[];
  details?: Record<string, any>;
};

/**
 * 校验 assessment conclusion 输出是否符合要求
 * @param outputText 输出文本（不含 JSON）
 * @returns 门禁结果
 */
export function gateAssessment(outputText: string): GateResult {
  const missing: string[] = [];
  const details: Record<string, any> = {};

  // 1. 检查【初筛总结】
  const summaryMatch = outputText.match(/【初筛总结】([\s\S]*?)(?=【|$)/);
  if (!summaryMatch) {
    missing.push('缺少【初筛总结】');
  } else {
    const summaryContent = summaryMatch[1];
    
    // 检查持续时间
    const durationPattern = /(天|周|月|年|不确定|约|大概|持续)/;
    const hasDuration = durationPattern.test(summaryContent);
    
    // 检查影响程度：只要该区块中出现任一模式即通过
    // 模式1: (\d{1,2})\s*/\s*10 (分数限制 0-10，>10 不算)
    // 模式2: (影响|困扰|功能).{0,12}(\d{1,2})\s*/\s*10
    let hasImpact = false;
    const pattern1 = /(\d{1,2})\s*\/\s*10/g;
    const pattern2 = /(影响|困扰|功能).{0,12}(\d{1,2})\s*\/\s*10/g;
    
    // 检查模式1：直接匹配 X/10 格式
    let match;
    while ((match = pattern1.exec(summaryContent)) !== null) {
      const score = parseInt(match[1], 10);
      if (score >= 0 && score <= 10) {
        hasImpact = true;
        break;
      }
    }
    
    // 如果模式1没匹配到，检查模式2：影响/困扰/功能 + X/10
    if (!hasImpact) {
      while ((match = pattern2.exec(summaryContent)) !== null) {
        const score = parseInt(match[2], 10);
        if (score >= 0 && score <= 10) {
          hasImpact = true;
          break;
        }
      }
    }
    
    // 检查主诉（弱规则：包含"你"/"主诉"/"提到"/"感到"等）
    const complaintPattern = /(你|主诉|提到|感到|说|表示)/;
    const hasComplaint = complaintPattern.test(summaryContent);
    
    if (!hasDuration) {
      missing.push('初筛总结缺少持续时间');
    }
    if (!hasImpact) {
      missing.push('初筛总结缺少影响程度');
    }
    if (!hasComplaint) {
      missing.push('初筛总结缺少主诉描述');
    }
    
    details.summary = {
      hasDuration,
      hasImpact,
      hasComplaint,
    };
  }

  // 2. 检查【风险与分流】
  const riskMatch = outputText.match(/【风险与分流】([\s\S]*?)(?=【|$)/);
  if (!riskMatch) {
    missing.push('缺少【风险与分流】');
  } else {
    const riskContent = riskMatch[1];
    
    // 检查是否命中三选一关键词（严格）
    const hasCrisis = /危机|crisis/i.test(riskContent);
    const hasUrgent = /建议尽快专业评估|urgent/i.test(riskContent);
    const hasSelfCare = /可先自助观察|self-care/i.test(riskContent);
    
    const riskTypeCount = [hasCrisis, hasUrgent, hasSelfCare].filter(Boolean).length;
    
    if (riskTypeCount === 0) {
      missing.push('风险分流未命中三选一（危机/建议尽快专业评估/可先自助观察）');
    } else if (riskTypeCount > 1) {
      missing.push('风险分流同时命中多个选项（应只选一个）');
    }
    
    details.risk = {
      hasCrisis,
      hasUrgent,
      hasSelfCare,
      riskTypeCount,
    };
  }

  // 3. 检查【下一步清单】
  // 注意：在 SKILL_MODE=steps_and_cards 模式下，nextStepsLines 由 Skill 系统生成
  // 这里只检查文本中是否存在该区块，具体格式验证由 Skill 系统负责
  const nextMatch = outputText.match(/【下一步清单】([\s\S]*?)(?=【|$)/);
  if (!nextMatch) {
    missing.push('缺少【下一步清单】');
  } else {
    const nextContent = nextMatch[1];
    
    // 解析清单条目（支持数字编号或 - 开头）
    const itemPattern = /(?:^\s*)(?:\d+\.|[-•])\s*(.+?)(?=\n\s*(?:\d+\.|[-•])|$)/gm;
    const items: string[] = [];
    let match;
    while ((match = itemPattern.exec(nextContent)) !== null) {
      items.push(match[1].trim());
    }
    
    // 如果没匹配到，尝试更宽松的模式
    if (items.length === 0) {
      const lines = nextContent.split('\n').filter(line => line.trim().length > 0);
      items.push(...lines.slice(0, 5)); // 最多取前5行
    }
    
    details.nextSteps = {
      itemCount: items.length,
      items: items.slice(0, 5), // 只记录前5条
    };
    
    // 使用统一的契约验证函数（如果 SKILL_MODE=steps_and_cards，应该由 Skill 系统保证格式正确）
    // 这里只做基本的数量检查，详细格式验证由 Skill 系统负责
    if (items.length < 2) {
      missing.push('清单条数不足（至少需要2条）');
    } else if (items.length > 3) {
      // 强化：最多3条（与契约一致）
      missing.push('清单条数过多（最多3条）');
    } else {
      // 使用统一的契约验证函数验证格式
      const contractResult = validateNextStepsLinesContract(items);
      contractResult.errors.forEach(error => {
        if (error.type === 'nextSteps_format') {
          missing.push(error.message);
          details.nextSteps = details.nextSteps || {};
          details.nextSteps.invalidItems = details.nextSteps.invalidItems || [];
          details.nextSteps.invalidItems.push({
            index: error.details.index,
            item: error.details.line,
          });
        }
      });
    }
  }

  return {
    pass: missing.length === 0,
    missing,
    details,
  };
}

/**
 * 校验 actionCards 的 steps 是否符合要求
 * 使用统一的契约验证函数，确保与 smoke、单测、运行时 gate 使用同一套逻辑
 * @param actionCards actionCards 数组
 * @returns 门禁结果
 */
export function gateActionCardsSteps(actionCards: Array<{ steps: string[] }>): GateResult {
  // 使用统一的契约验证函数
  const contractResult = validateActionCardsContract(actionCards as any);
  
  const missing: string[] = [];
  const details: Record<string, any> = {
    invalidSteps: [],
  };

  // 将契约验证错误转换为 gate 格式
  contractResult.errors.forEach(error => {
    switch (error.type) {
      case 'actionCards_count':
        missing.push(error.message);
        break;
      case 'steps_count':
        missing.push(error.message);
        if (error.details) {
          details.stepsCount = {
            cardIndex: error.details.cardIndex,
            expected: error.details.expected,
            actual: error.details.actual,
          };
        }
        break;
      case 'step_length':
      case 'step_metric':
        missing.push(error.message);
        if (error.details) {
          details.invalidSteps.push({
            cardIndex: error.details.cardIndex,
            stepIndex: error.details.stepIndex,
            step: error.details.step,
            reason: error.type === 'step_length' 
              ? `长度超限（${error.details.charCount}字）`
              : '缺少时长/次数/触发器',
          });
        }
        break;
    }
  });

  // 额外检查：抽象句（保持与原有逻辑兼容）
  if (actionCards && actionCards.length > 0) {
    actionCards.forEach((card, cardIdx) => {
      if (card.steps && Array.isArray(card.steps)) {
        card.steps.forEach((step, stepIdx) => {
          const stepText = step.trim();
          const abstractKeywords = [
            '保持', '持续进行', '直到', '维持', '继续',
            '坚持', '保持冷静', '保持稳定', '持续观察',
            '直到有睡意', '直到感觉好', '直到缓解',
          ];
          const isAbstract = abstractKeywords.some(keyword => stepText.includes(keyword));
          
          if (isAbstract && !stepText.match(/\d+(分钟|次|天|周|小时|秒)/)) {
            // 如果包含抽象词但没有时长/次数，认为是抽象句
            const errorMsg = `卡片 ${cardIdx + 1} 步骤 ${stepIdx + 1} 为抽象句："${stepText.substring(0, 20)}"`;
            if (!missing.includes(errorMsg)) {
              missing.push(errorMsg);
              details.invalidSteps.push({
                cardIndex: cardIdx + 1,
                stepIndex: stepIdx + 1,
                step: stepText,
                reason: '抽象句（缺少时长/次数/触发器）',
              });
            }
          }
        });
      }
    });
  }

  return {
    pass: missing.length === 0,
    missing,
    details,
  };
}

/**
 * 校验 crisis 场景输出是否符合强约束
 * @param outputText 输出文本
 * @returns 门禁结果
 */
export function gateCrisis(outputText: string): GateResult {
  const missing: string[] = [];
  const details: Record<string, any> = {};

  // 1. 检查安全步骤
  const safetyKeywords = ['远离工具', '联系身边人', '拨打急救', '移除危险', '去安全的地方', '联系信任的人', '拨打求助热线'];
  const hasSafetySteps = safetyKeywords.some(keyword => outputText.includes(keyword));
  
  if (!hasSafetySteps) {
    missing.push('缺少安全步骤（例如"远离工具/联系身边人/拨打急救"）');
  }
  
  details.hasSafetySteps = hasSafetySteps;
  details.safetyKeywordsFound = safetyKeywords.filter(keyword => outputText.includes(keyword));

  // 2. 检查资源（热线/急救等）
  const resourceKeywords = ['热线', '400', '161', '9995', '急救', '求助', '专业帮助', '危机干预'];
  const hasResources = resourceKeywords.some(keyword => outputText.includes(keyword));
  
  if (!hasResources) {
    missing.push('缺少资源（热线/急救等）');
  }
  
  details.hasResources = hasResources;
  details.resourceKeywordsFound = resourceKeywords.filter(keyword => outputText.includes(keyword));

  // 3. 检查确认问题（例如"你现在一个人吗？是否安全？"）
  const confirmationPatterns = [
    /你现在.*?安全/,
    /是否安全/,
    /有人陪伴/,
    /是否.*?一个人/,
    /你现在.*?一个人/,
    /是否愿意.*?联系/,
  ];
  const hasConfirmation = confirmationPatterns.some(pattern => pattern.test(outputText));
  
  if (!hasConfirmation) {
    missing.push('缺少确认问题（例如"你现在一个人吗？是否安全？"）');
  }
  
  details.hasConfirmation = hasConfirmation;

  return {
    pass: missing.length === 0,
    missing,
    details,
  };
}

