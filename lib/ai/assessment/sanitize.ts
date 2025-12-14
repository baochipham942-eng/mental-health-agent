import { ActionCard } from '@/types/chat';

/**
 * 计算字符串中的汉字数量（只计算汉字，不包括标点、数字、英文）
 * 统一函数，sanitize 和 gate 共用，确保计数一致
 */
export function countChineseChars(text: string): number {
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length;
}

/**
 * 检测 step 是否包含时长/次数/触发器至少之一
 * 与 gate 使用相同的检测逻辑，确保口径一致
 * 门禁宽口径：识别 ×N次、N分钟、N秒、N组、N轮、N遍、N回，以及现有 条/个/项
 */
export function hasMetricToken(step: string): boolean {
  // 时长：分钟/小时/天/周/秒 等时间单位
  const hasDuration = /\d+\s*(分钟|小时|天|周|秒|周内|天内|分钟内)/.test(step);
  
  // 次数：次/遍/回/组/轮/条/个/× 等（轮/组/遍/回 必须被视为有效指标）
  const hasCount = /\d+\s*(次|遍|回|组|轮|条|个|×)/.test(step) || /×\s*\d+\s*次/.test(step);
  
  // 触发器：如果/当/一旦/当...时/如果...就/焦虑≥7分/评分≤4分 等
  const hasTrigger = /(如果|当|一旦|当.*时|如果.*就|焦虑|评分|情绪).*?(≥|<=|≤|>|<|\d+分)/.test(step) ||
                    /(如果|当|一旦).*?(出现|加剧|升到|达到|超过)/.test(step);
  
  return hasDuration || hasCount || hasTrigger;
}

/**
 * 常见违规短句映射表：自动修复缺失指标的步骤
 * 优先匹配长串，避免部分匹配
 */
const VIOLATION_MAPPINGS: Record<string, string> = {
  // 用户提到的具体失败案例
  '写下3条具体担心': '写下3条担心×1次',
  '写下3条担心': '写下3条担心×1次',
  '写下1条担心': '写下1条担心×1次',
  '写1条新想法': '写1条新想法×1次',
  '标记1个可行动项': '标记1项×1次',
  '给朋友发1条消息': '发消息1条×1次',
  '写下1个平静感受': '写下1感受×1次',
  // 其他常见违规模式
  '写下3条': '写下3条×1次',
  '写下1条': '写下1条×1次',
  '写下2条': '写下2条×1次',
  '写下4条': '写下4条×1次',
  '写下5条': '写下5条×1次',
  '标记1个': '标记1项×1次',
  '标记2个': '标记2项×1次',
  '标记3个': '标记3项×1次',
  '记录': '记录1次',
  '记录感受': '记录1次',
  '记录想法': '记录1次',
  '记录情绪': '记录1次',
  '思考': '思考1分钟',
  '列出': '列出3条×1次',
  '整理': '整理1次',
  // 抽象句映射（保留原有）
  '保持冷静': '喝温水1口',
  '持续进行': '呼吸4-6次×5轮',
  '直到有睡意': '听白噪音10分',
  '想一想': '写下3条×1次',
  '调整心态': '离开现场2分',
  '维持稳定': '深呼吸3次',
  '坚持下去': '记录3天',
  '把注意力放在呼吸上': '数呼吸1分钟',
  '把注意力放在': '数呼吸1分钟',
  '注意力放在': '数呼吸1分钟',
  '持续进行，直到': '呼吸5次',
  '持续进行直到': '呼吸5次',
  '直到感觉好': '呼吸5次',
  '直到缓解': '呼吸5次',
  '保持稳定': '深呼吸3次',
  '保持放松': '深呼吸3次',
  '保持平静': '深呼吸3次',
  '继续坚持': '记录3天',
  '继续观察': '记录3天',
  '持续观察': '记录3天',
  '调整状态': '离开现场2分',
  '调整情绪': '离开现场2分',
  '调整呼吸': '呼吸5次',
  '放松身心': '深呼吸3次',
  '放松身体': '深呼吸3次',
  '放松心情': '深呼吸3次',
  '平复情绪': '深呼吸3次',
  '稳定情绪': '深呼吸3次',
  '缓解紧张': '深呼吸3次',
  '缓解焦虑': '深呼吸3次',
  '缓解压力': '深呼吸3次',
  '进行深呼吸': '深呼吸5次',
  '进行放松': '深呼吸3次',
  '进行冥想': '数呼吸1分钟',
  '进行练习': '记录3天',
  '保持深呼吸': '深呼吸5次',
  '保持节奏': '呼吸5次',
  '保持专注': '数呼吸1分钟',
  '直到入睡': '听白噪音10分',
  '直到睡着': '听白噪音10分',
  '直到平静': '呼吸5次',
  '直到放松': '呼吸5次',
};

/**
 * 压缩虚词：删除冗余副词、连接词等，为补齐指标腾出空间
 */
function compressStep(step: string): string {
  let compressed = step.trim();
  
  // 删除常见虚词（具体/简短/当下/一下/一下子/慢慢/认真等）
  compressed = compressed
    .replace(/具体|简短|当下|一下|一下子|慢慢|认真|仔细|好好|轻轻|静静/g, '')
    .replace(/立刻|马上|尽量|并且|然后|直到|接着|随后/g, '')
    .replace(/\s+/g, '')
    .replace(/[，,。；;：:]/g, '');
  
  return compressed.trim();
}

/**
 * 缩短超长步骤
 */
function shortenStep(step: string): string {
  let shortened = step.trim();
  const originalLength = countChineseChars(shortened);
  
  if (originalLength <= 16) {
    return shortened;
  }
  
  // 策略1：压缩虚词
  shortened = compressStep(shortened);
  
  // 策略2：用短格式替换长格式
  shortened = shortened
    .replace(/深呼吸(\d+)次，每次(\d+)秒/g, '吸气$2秒×$1次')
    .replace(/播放舒缓白噪音/g, '放白噪音10分')
    .replace(/将注意力放在呼吸上/g, '数呼吸1分钟')
    .replace(/进行(\d+)分钟/g, '$1分钟')
    .replace(/持续(\d+)/g, '$1');
  
  // 策略3：移除括号内容
  shortened = shortened.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
  
  // 策略4：如果仍超 16，保留动作核心 + 补一个极短的次数/时长
  const currentLength = countChineseChars(shortened);
  if (currentLength > 16) {
    // 提取核心动作（动词+名词）
    const coreMatch = shortened.match(/([^0-9\s]+?)(\d+)/);
    if (coreMatch) {
      const core = coreMatch[1].replace(/[的了的]/g, '');
      const num = coreMatch[2];
      // 尝试提取动作词
      const actionMatch = core.match(/(写|做|走|听|看|数|放|调|关|离|吸|呼|停|去)/);
      if (actionMatch) {
        shortened = actionMatch[0] + num + (core.includes('分') ? '分' : '次');
      }
    }
    
    // 如果还是太长，直接截断到16字
    const chars = shortened.match(/[\u4e00-\u9fa5]/g) || [];
    if (chars.length > 16) {
      shortened = chars.slice(0, 16).join('');
    }
  }
  
  return shortened;
}

/**
 * 规范化 step 中的指标，去除重复和错位
 * 规则：
 * 0. 将 (\d+)次(\d+分钟|\d+秒) 归一为仅保留时长部分（如 1次1分钟→1分钟）
 * 1. 将连续重复的 "×N次" 去重为 1 个
 * 2. 若 step 同时包含 "条/个/项" 与 "×N次"，允许保留一次 "×N次"，但不得重复出现
 * 3. 修复类似 "写下3条×1次平静事×1次" 的插入错位：把 "×N次" 移到句末，仅保留 1 个
 * 4. 不要破坏 ≤16 汉字限制；如超长，优先调用现有 compressStep() 后再 normalize
 * @param step 步骤文本
 * @returns 规范化后的步骤文本
 */
export function normalizeStepMetrics(step: string): string {
  let normalized = step.trim();
  
  // 如果为空，直接返回
  if (!normalized) {
    return normalized;
  }
  
  // 0. 归一化 "N次N分钟" 或 "N次N秒" 为仅保留时长部分（如 记录1次1分钟×1次 → 记录1分钟×1次）
  // 匹配模式：(\d+)次(\d+分钟|\d+秒)，替换为仅保留时长部分
  normalized = normalized.replace(/(\d+)次(\d+分钟|\d+秒)/g, '$2');
  
  // 1. 去重连续重复的 "×N次" 模式
  // 匹配 "×数字次" 的连续重复，例如 "×1次×1次" → "×1次"
  normalized = normalized.replace(/(×\s*\d+\s*次)\1+/g, '$1');
  
  // 2. 提取所有 "×N次" 模式
  const timesPattern = /×\s*\d+\s*次/g;
  const timesMatches: Array<{ match: string; index: number }> = [];
  let match;
  while ((match = timesPattern.exec(normalized)) !== null) {
    timesMatches.push({ match: match[0], index: match.index });
  }
  
  // 如果没有 "×N次"，直接返回
  if (timesMatches.length === 0) {
    // 检查长度，如果超长，先压缩
    const currentLength = countChineseChars(normalized);
    if (currentLength > 16) {
      normalized = compressStep(normalized);
    }
    return normalized.trim();
  }
  
  // 3. 如果有多个 "×N次"，只保留最后一个，并移到句末
  if (timesMatches.length > 1) {
    // 找到最后一个 "×N次" 的位置
    const lastMatch = timesMatches[timesMatches.length - 1];
    const lastIndex = lastMatch.index;
    const lastLength = lastMatch.match.length;
    
    // 移除所有 "×N次"（包括最后一个）
    let withoutTimes = normalized;
    for (let i = timesMatches.length - 1; i >= 0; i--) {
      const m = timesMatches[i];
      withoutTimes = withoutTimes.substring(0, m.index) + withoutTimes.substring(m.index + m.match.length);
    }
    
    // 将最后一个 "×N次" 添加到句末
    normalized = withoutTimes.trim() + lastMatch.match;
  } else {
    // 只有一个 "×N次"，检查是否在句末
    const singleMatch = timesMatches[0];
    const afterMatch = normalized.substring(singleMatch.index + singleMatch.match.length).trim();
    if (afterMatch.length > 0) {
      // 不在句末，移到句末
      const beforeMatch = normalized.substring(0, singleMatch.index).trim();
      normalized = beforeMatch + afterMatch + singleMatch.match;
    }
  }
  
  // 4. 清理多余空格
  normalized = normalized.replace(/\s+/g, '');
  
  // 5. 检查长度，如果超长，先压缩再规范化
  const currentLength = countChineseChars(normalized);
  if (currentLength > 16) {
    normalized = compressStep(normalized);
    // 压缩后可能破坏了指标，需要重新规范化
    // 但这里不再递归调用，避免无限循环
    // 如果压缩后仍超长，会在后续流程中被 shortenStep 处理
  }
  
  return normalized.trim();
}

/**
 * 检测 step 是否已经包含明确的次数/时长指标（用于避免二次补齐）
 * 与 hasMetricToken 的区别：这个函数更严格，只检测明确的指标，不包括量词（条/个/项）
 * 防二次补齐严口径：识别 ×N次/N分钟/N秒/N组/N轮/N遍/N回
 */
function hasExplicitMetric(step: string): boolean {
  // 时长：分钟/小时/天/周/秒 等时间单位
  const hasDuration = /\d+\s*(分钟|小时|天|周|秒|周内|天内|分钟内)/.test(step);
  
  // 明确的次数指标：×N次 / N次 / N遍 / N回 / N组 / N轮（轮/组/遍/回 必须被视为有效指标）
  const hasExplicitCount = /×\s*\d+\s*次/.test(step) || 
                          /\d+\s*(次|遍|回|组|轮)(?!\s*(条|个|项))/.test(step);
  
  // 触发器：如果/当/一旦/当...时/如果...就/焦虑≥7分/评分≤4分 等
  const hasTrigger = /(如果|当|一旦|当.*时|如果.*就|焦虑|评分|情绪).*?(≥|<=|≤|>|<|\d+分)/.test(step) ||
                    /(如果|当|一旦).*?(出现|加剧|升到|达到|超过)/.test(step);
  
  return hasDuration || hasExplicitCount || hasTrigger;
}

/**
 * 确保 step 包含时长/次数/触发器至少之一
 * 优先使用极短补丁（×N次 / N分钟 / N秒），保证 ≤16 汉字
 * @param step 步骤文本
 * @param when 触发时机（可选，触发器优先放在 when 字段）
 * @returns 补齐后的步骤文本
 */
export function ensureStepHasMetric(step: string, when?: string): string {
  // 如果已有明确的指标（不包括仅量词），直接返回，不再追加
  if (hasExplicitMetric(step)) {
    return step;
  }
  
  // 如果只包含量词（条/个/项），按当前门禁口径它已经是次数指标
  // 不要强行追加 "×1次"（否则容易出现"条 + ×1次"的冗余表达）
  // 但需要确保量词确实存在
  const hasQuantityWord = /\d+\s*(条|个|项)/.test(step);
  if (hasQuantityWord && !hasExplicitMetric(step)) {
    // 只包含量词，不包含明确指标，按门禁口径已经满足要求，直接返回
    return step;
  }
  
  // 先尝试压缩虚词，为补齐腾出空间
  let compressed = compressStep(step);
  const compressedLength = countChineseChars(compressed);
  const originalLength = countChineseChars(step);
  
  // 优先使用压缩后的版本（如果压缩后更短）
  const workingStep = compressedLength < originalLength ? compressed : step;
  const workingLength = Math.min(compressedLength, originalLength);
  
  // 补齐策略：优先使用最短格式
  // 1. 如果 ≤12 字，优先补 "×1次"（最短，3个字符：×1次）
  if (workingLength <= 12) {
    // 检查是否已有"条"或"个"（表示数量），补"×1次"
    if (workingStep.match(/\d+\s*(条|个)/)) {
      return workingStep + '×1次';
    }
    // 否则补"1次"
    return workingStep + '1次';
  }
  
  // 2. 如果 ≤14 字，补 "1分钟" 或 "×1次"
  if (workingLength <= 14) {
    // 对于"写下/记录/标记"类动作，优先补"×1次"
    if (workingStep.match(/(写下|记录|标记|列出|整理)/)) {
      return workingStep + '×1次';
    }
    // 其他情况补"1分钟"
    return workingStep + '1分钟';
  }
  
  // 3. 如果 15-18 字，先压缩再补齐
  if (workingLength >= 15 && workingLength <= 18) {
    // 使用压缩后的版本
    const finalCompressed = compressStep(step);
    const finalLength = countChineseChars(finalCompressed);
    
    if (finalLength <= 12) {
      if (finalCompressed.match(/\d+\s*(条|个)/)) {
        return finalCompressed + '×1次';
      }
      return finalCompressed + '1次';
    }
    if (finalLength <= 14) {
      if (finalCompressed.match(/(写下|记录|标记|列出|整理)/)) {
        return finalCompressed + '×1次';
      }
      return finalCompressed + '1分钟';
    }
  }
  
  // 4. 如果还是太长，尝试提取核心动作后补齐
  // 提取数字（如果有）
  const numMatch = workingStep.match(/(\d+)/);
  const num = numMatch ? numMatch[1] : '1';
  
  // 提取动作词
  const actionMatch = workingStep.match(/(写下|记录|标记|列出|整理|写|做|走|听|看|数|放|调|关|离|吸|呼|停|去)/);
  if (actionMatch) {
    const action = actionMatch[0];
    // 尝试构建最短版本
    const shortVersion = action + num + '×1次';
    if (countChineseChars(shortVersion) <= 16) {
      return shortVersion;
    }
  }
  
  // 最后兜底：如果还是无法补齐，返回原样（会在后续流程中被截断）
  return step;
}

/**
 * 补充缺失的时长/次数/触发器（兼容旧接口）
 * @deprecated 使用 ensureStepHasMetric 代替
 */
function addMissingRequirement(step: string): string {
  return ensureStepHasMetric(step);
}

/**
 * 处理抽象句和违规短句
 * 优化：优先使用映射表，对轻微违规尽量 sanitize 解决
 */
function fixAbstractStep(step: string): string {
  // 先检查违规短句映射表（优先匹配长串，避免部分匹配）
  const sortedMappings = Object.entries(VIOLATION_MAPPINGS).sort((a, b) => b[0].length - a[0].length);
  for (const [violation, fixed] of sortedMappings) {
    if (step.includes(violation)) {
      // 如果完全匹配，直接替换
      if (step.trim() === violation) {
        return fixed;
      }
      // 如果包含，尝试替换
      const replaced = step.replace(violation, fixed);
      // 检查替换后是否满足要求
      if (hasMetricToken(replaced)) {
        return replaced;
      }
    }
  }
  
  // 检查是否包含抽象关键词但缺少时长/次数/触发器
  const abstractKeywords = [
    '保持', '持续进行', '直到', '维持', '继续',
    '坚持', '保持冷静', '保持稳定', '持续观察',
    '直到有睡意', '直到感觉好', '直到缓解',
    '想一想', '调整心态', '把注意力放在',
    '进行', '放松', '平复', '稳定', '缓解',
  ];
  
  const isAbstract = abstractKeywords.some(keyword => step.includes(keyword));
  
  if (isAbstract && !hasMetricToken(step)) {
    // 尝试自动补充
    return ensureStepHasMetric(step);
  }
  
  return step;
}

/**
 * 清洗 actionCards 的 steps，确保满足门禁要求
 * @param actionCards 原始 actionCards
 * @returns 清洗后的 actionCards
 */
export function sanitizeActionCards(actionCards: ActionCard[]): ActionCard[] {
  if (!actionCards || actionCards.length === 0) {
    return actionCards;
  }
  
  return actionCards.map(card => {
    if (!card.steps || !Array.isArray(card.steps)) {
      return card;
    }
    
    const sanitizedSteps = card.steps.map(step => {
      let sanitized = step.trim();
      
      // 步骤1：处理抽象句和违规短句（使用映射表）
      sanitized = fixAbstractStep(sanitized);
      
      // 步骤2：确保有时长/次数/触发器（使用 ensureStepHasMetric）
      sanitized = ensureStepHasMetric(sanitized, card.when);
      
      // 步骤3：缩短超长步骤（如果补齐后超长，先压缩再补齐）
      const currentLength = countChineseChars(sanitized);
      if (currentLength > 16) {
        // 先压缩虚词
        sanitized = compressStep(sanitized);
        // 如果压缩后仍缺少指标，再次补齐
        if (!hasMetricToken(sanitized)) {
          sanitized = ensureStepHasMetric(sanitized, card.when);
        }
        // 如果还是超长，缩短
        sanitized = shortenStep(sanitized);
      }
      
      // 步骤4：最终长度检查（如果还是超，强制截断）
      const finalLength = countChineseChars(sanitized);
      if (finalLength > 16) {
        const chars = sanitized.match(/[\u4e00-\u9fa5]/g) || [];
        sanitized = chars.slice(0, 16).join('');
        // 截断后如果缺少指标，再次补齐（但可能超长，会在 gate 中被检测到）
        if (!hasMetricToken(sanitized)) {
          sanitized = ensureStepHasMetric(sanitized, card.when);
        }
      }
      
      // 步骤5：规范化指标，去除重复和错位（在流水线末尾统一调用）
      sanitized = normalizeStepMetrics(sanitized);
      
      return sanitized;
    });
    
    return {
      ...card,
      steps: sanitizedSteps,
    };
  });
}
