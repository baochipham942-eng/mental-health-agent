import { countChineseChars, hasMetricToken } from './sanitize';

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

    // 检查影响程度
    let hasImpact = false;
    const pattern1 = /(\d{1,2})\s*\/\s*10/g;
    const pattern2 = /(影响|困扰|功能).{0,12}(\d{1,2})\s*\/\s*10/g;

    if (pattern1.test(summaryContent) || pattern2.test(summaryContent)) {
      hasImpact = true;
    }

    // 检查主诉
    const complaintPattern = /(你|主诉|提到|感到|说|表示)/;
    const hasComplaint = complaintPattern.test(summaryContent);

    if (!hasDuration) missing.push('初筛总结缺少持续时间');
    if (!hasImpact) missing.push('初筛总结缺少影响程度');
    if (!hasComplaint) missing.push('初筛总结缺少主诉描述');

    details.summary = { hasDuration, hasImpact, hasComplaint };
  }

  // 2. 检查【风险与分流】
  const riskMatch = outputText.match(/【风险与分流】([\s\S]*?)(?=【|$)/);
  if (!riskMatch) {
    missing.push('缺少【风险与分流】');
  } else {
    const riskContent = riskMatch[1];
    const hasCrisis = /危机|crisis/i.test(riskContent);
    const hasUrgent = /建议尽快专业评估|urgent/i.test(riskContent);
    const hasSelfCare = /可先自助观察|self-care/i.test(riskContent);

    const riskTypeCount = [hasCrisis, hasUrgent, hasSelfCare].filter(Boolean).length;

    if (riskTypeCount === 0) missing.push('风险分流未命中三选一');
    else if (riskTypeCount > 1) missing.push('风险分流同时命中多个选项');

    details.risk = { hasCrisis, hasUrgent, hasSelfCare, riskTypeCount };
  }

  // 3. 检查【下一步清单】
  const nextMatch = outputText.match(/【下一步清单】([\s\S]*?)(?=【|$)/);
  if (!nextMatch) {
    missing.push('缺少【下一步清单】');
  } else {
    const nextContent = nextMatch[1];
    const itemPattern = /(?:^\s*)(?:\d+\.|[-•])\s*(.+?)(?=\n\s*(?:\d+\.|[-•])|$)/gm;
    const items: string[] = [];
    let match;
    while ((match = itemPattern.exec(nextContent)) !== null) items.push(match[1].trim());

    if (items.length === 0) {
      const lines = nextContent.split('\n').filter(line => line.trim().length > 0);
      items.push(...lines.slice(0, 5));
    }

    details.nextSteps = { itemCount: items.length, items: items.slice(0, 5) };

    if (items.length < 2) missing.push('清单条数不足（至少2条）');
    else if (items.length > 3) missing.push('清单条数过多（最多3条）');
  }

  return {
    pass: missing.length === 0,
    missing,
    details,
  };
}

/**
 * 校验 actionCards 的 steps 是否符合要求 (Self-contained version)
 */
export function gateActionCardsSteps(actionCards: Array<{ steps: string[] }>): GateResult {
  const missing: string[] = [];
  const details: Record<string, any> = { invalidSteps: [] };

  if (!actionCards || !Array.isArray(actionCards)) {
    return { pass: false, missing: ['ActionCards 格式错误'] };
  }

  if (actionCards.length !== 2) {
    missing.push(`ActionCards 数量错误 (期待 2，实际 ${actionCards.length})`);
  }

  actionCards.forEach((card, cardIdx) => {
    if (!card.steps || !Array.isArray(card.steps)) {
      missing.push(`Card ${cardIdx + 1} steps 缺失`);
      return;
    }

    if (card.steps.length !== 3) {
      missing.push(`Card ${cardIdx + 1} steps 数量错误 (期待 3，实际 ${card.steps.length})`);
    }

    card.steps.forEach((step, stepIdx) => {
      const stepText = step.trim();
      const len = countChineseChars(stepText);
      const MAX_LEN = 16;

      if (len > MAX_LEN) {
        missing.push(`Card ${cardIdx + 1} Step ${stepIdx + 1} 长度超限 (${len} > ${MAX_LEN})`);
        details.invalidSteps.push({
          cardIndex: cardIdx + 1,
          stepIndex: stepIdx + 1,
          step: stepText,
          reason: '长度超限'
        });
      }

      if (!hasMetricToken(stepText)) {
        missing.push(`Card ${cardIdx + 1} Step ${stepIdx + 1} 缺少时长/次数`);
        details.invalidSteps.push({
          cardIndex: cardIdx + 1,
          stepIndex: stepIdx + 1,
          step: stepText,
          reason: '缺少时长/次数'
        });
      }
    });
  });

  return {
    pass: missing.length === 0,
    missing,
    details,
  };
}

/**
 * 校验 crisis 场景输出
 */
export function gateCrisis(outputText: string): GateResult {
  const missing: string[] = [];
  const details: Record<string, any> = {};

  const safetyKeywords = ['远离工具', '联系身边人', '拨打急救', '移除危险', '去安全的地方', '联系信任的人', '拨打求助热线'];
  const hasSafetySteps = safetyKeywords.some(keyword => outputText.includes(keyword));
  if (!hasSafetySteps) missing.push('缺少安全步骤');

  const resourceKeywords = ['热线', '400', '161', '9995', '急救', '求助', '专业帮助', '危机干预'];
  const hasResources = resourceKeywords.some(keyword => outputText.includes(keyword));
  if (!hasResources) missing.push('缺少资源（热线/急救等）');

  return {
    pass: missing.length === 0,
    missing,
    details: { hasSafetySteps, hasResources }
  };
}
