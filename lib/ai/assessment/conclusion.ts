import { chatCompletion, ChatMessage } from '../deepseek';
import { ASSESSMENT_CONCLUSION_PROMPT, ASSESSMENT_CONCLUSION_FIXER_PROMPT } from '../prompts';
import { ActionCard } from '@/types/chat';
import { gateAssessment, gateActionCardsSteps, GateResult } from './gates';
import { sanitizeActionCards } from './sanitize';
import { extractSkillContext } from '../../skills/context';
import { selectSkills } from '../../skills/select';
import { renderSkills } from '../../skills/render';

export interface AssessmentConclusionResult {
  reply: string;
  actionCards: ActionCard[];
  gate?: {
    pass: boolean;
    fixed: boolean;
    missing: string[];
  };
  debugPrompts?: {
    systemPrompt: string;
    userPrompt: string;
    messages: Array<{ role: string; content: string }>;
    selectedSkillIds?: string[];
    selectionReason?: string;
    slotValues?: Record<string, any>;
  };
}

/**
 * 脱敏函数：隐藏敏感信息
 */
function sanitizeText(text: string): string {
  let sanitized = text;
  
  // Bearer token → Bearer [REDACTED]
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9\-_]+/gi, 'Bearer [REDACTED]');
  
  // sk- key (API keys) → sk-[REDACTED]
  sanitized = sanitized.replace(/sk-[A-Za-z0-9\-_]+/gi, 'sk-[REDACTED]');
  
  // api_key / api-key / apikey → api_key=[REDACTED]
  sanitized = sanitized.replace(/api[_-]?key\s*[:=]\s*[A-Za-z0-9\-_]+/gi, 'api_key=[REDACTED]');
  
  // token=... / token: ... / token "..." → token=[REDACTED]
  sanitized = sanitized.replace(/token\s*[:=]\s*["']?[A-Za-z0-9\-_]+["']?/gi, 'token=[REDACTED]');
  sanitized = sanitized.replace(/token\s+["']([A-Za-z0-9\-_]+)["']/gi, 'token [REDACTED]');
  
  // 邮箱 → [EMAIL_REDACTED]
  sanitized = sanitized.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, '[EMAIL_REDACTED]');
  
  // 中国手机号 11 位（允许中间空格/横线）→ [PHONE_REDACTED]
  sanitized = sanitized.replace(/1[3-9]\d[\s\-]?\d{4}[\s\-]?\d{4}/g, '[PHONE_REDACTED]');
  
  return sanitized;
}

/**
 * 从回复文本中提取 actionCards JSON
 */
function extractActionCards(reply: string): ActionCard[] {
  try {
    // 尝试提取 JSON 代码块
    const jsonMatch = reply.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1];
      const parsed = JSON.parse(jsonStr);
      if (parsed.actionCards && Array.isArray(parsed.actionCards)) {
        return parsed.actionCards;
      }
    }
    
    // 尝试提取纯 JSON 对象
    const jsonObjectMatch = reply.match(/\{\s*"actionCards"\s*:[\s\S]*\}/);
    if (jsonObjectMatch) {
      const parsed = JSON.parse(jsonObjectMatch[0]);
      if (parsed.actionCards && Array.isArray(parsed.actionCards)) {
        return parsed.actionCards;
      }
    }
  } catch (e) {
    console.error('Failed to parse actionCards from reply:', e);
  }
  
  // 如果解析失败，返回空数组
  return [];
}

/**
 * 从回复文本中移除 actionCards JSON，只保留文本部分
 * 支持移除多种格式的 JSON（代码块、纯对象、残片等）
 */
function removeActionCardsFromReply(reply: string): string {
  let cleaned = reply;
  
  // 移除 JSON 代码块（```json ... ```）
  cleaned = cleaned.replace(/```json\s*[\s\S]*?\s*```/gi, '');
  
  // 移除纯 JSON 对象（{"actionCards": ...}）
  cleaned = cleaned.replace(/\{\s*"actionCards"\s*:[\s\S]*?\}/g, '');
  
  // 移除可能的 JSON 残片（不完整的 JSON）
  cleaned = cleaned.replace(/\{\s*"actionCards"\s*:[\s\S]*$/g, '');
  cleaned = cleaned.replace(/^[\s\S]*"actionCards"\s*:[\s\S]*\}/g, '');
  
  return cleaned.trim();
}

/**
 * 清洗 followupAnswer，移除重复的 initialMessage 内容
 * @param followupAnswer 用户对评估问题的回答
 * @param initialMessage 用户初始主诉
 * @returns 清洗后的 followupAnswer
 */
function deduplicateFollowupAnswer(followupAnswer: string, initialMessage: string): string {
  let cleaned = followupAnswer.trim();
  
  // 如果 followupAnswer 为空，直接返回
  if (!cleaned || !initialMessage) {
    return cleaned;
  }
  
  const initialTrimmed = initialMessage.trim();
  if (initialTrimmed.length === 0) {
    return cleaned;
  }
  
  // 1. 检查是否包含"初始主诉："这类拼接痕迹，优先移除
  const initialComplaintPattern = /初始主诉\s*[:：]\s*/i;
  if (initialComplaintPattern.test(cleaned)) {
    // 移除"初始主诉：..."部分（包括后面的内容直到下一个段落或结束）
    // 匹配 "初始主诉：" 到下一个段落分隔符或 "对评估问题的回答：" 之间的内容
    cleaned = cleaned.replace(/初始主诉\s*[:：]\s*[\s\S]*?(?=\n\n对评估问题的回答\s*[:：]|$)/gi, '');
    // 也处理单行的情况
    cleaned = cleaned.replace(/初始主诉\s*[:：]\s*[^\n]*(?:\n|$)/gi, '');
  }
  
  // 2. 移除重复的 initialMessage 内容
  // 如果 followupAnswer 中包含完整的 initialMessage，则移除
  if (cleaned.includes(initialTrimmed)) {
    // 使用更精确的匹配：移除完整匹配，但保留上下文
    // 先尝试移除独立出现的 initialMessage（前后有标点或换行）
    const escapedInitial = initialTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 匹配前后有标点、换行或边界的完整 initialMessage
    const fullMatchPattern = new RegExp(`(?:^|\\s|[。！？，、；：])\\s*${escapedInitial}\\s*(?:[。！？，、；：]|\\s|$)`, 'gi');
    cleaned = cleaned.replace(fullMatchPattern, ' ');
    
    // 如果还有残留，尝试直接替换（但要小心，避免误删）
    if (cleaned.includes(initialTrimmed) && initialTrimmed.length > 10) {
      // 只在 initialMessage 较长时才直接替换，避免误删短文本
      cleaned = cleaned.replace(initialTrimmed, '');
    }
  }
  
  // 3. 清理多余的空行和空格
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.trim();
  
  return cleaned;
}

/**
 * 生成心理评估初筛结论
 * @param initialMessage 用户初始主诉
 * @param followupAnswer 用户对评估问题的回答（可能包含多轮）
 * @param history 对话历史
 * @returns 包含初筛总结、风险分流、下一步清单和 actionCards 的结果
 */
export async function generateAssessmentConclusion(
  initialMessage: string,
  followupAnswer: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<AssessmentConclusionResult> {
  // 读取 SKILL_MODE 环境变量
  const skillMode = (process.env.SKILL_MODE || 'off').toLowerCase() as 'off' | 'cards_only' | 'steps_and_cards';
  
  // 任务 A：清洗 followupAnswer，移除重复的 initialMessage
  const cleanedFollowupAnswer = deduplicateFollowupAnswer(followupAnswer, initialMessage);
  
  // 任务 B：瘦身 messages，默认不传 history
  // 仅在环境变量 CONCLUSION_INCLUDE_HISTORY === '1' 时才包含 history
  const shouldIncludeHistory = process.env.CONCLUSION_INCLUDE_HISTORY === '1';

  // Skill 系统：提取上下文并选择 Skills（仅在非 off 模式）
  let skillSelections: Array<{ skillId: string; slotValues: Record<string, string | number> }> = [];
  let skillSelectionReasons: string[] = [];
  if (skillMode !== 'off') {
    try {
      const skillContext = extractSkillContext(initialMessage, cleanedFollowupAnswer);
      const selections = selectSkills(skillContext);
      skillSelections = selections.map(s => ({ skillId: s.skillId, slotValues: s.slotValues }));
      skillSelectionReasons = selections.map(s => s.reason);
      console.log(`[Skill] Mode: ${skillMode}, Selected skills: ${selections.map(s => s.skillId).join(', ')}, Reasons: ${skillSelectionReasons.join('; ')}`);
    } catch (error) {
      console.error('[Skill] Failed to select skills:', error);
      // 如果 Skill 选择失败，回退到 off 模式
    }
  }
  
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: ASSESSMENT_CONCLUSION_PROMPT,
    },
    // 仅在需要时包含 history
    ...(shouldIncludeHistory ? history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })) : []),
    {
      role: 'user',
      content: `初始主诉：${initialMessage}\n\n对评估问题的回答：${cleanedFollowupAnswer}`,
    },
  ];

  // 生成 debugPrompts 对象（仅在 DEBUG_PROMPTS=1 时）
  let debugPrompts: AssessmentConclusionResult['debugPrompts'] | undefined;
  if (process.env.DEBUG_PROMPTS === '1') {
    // 从末尾向前找最后一个 role==='user' 的 message
    let lastUserMessage: ChatMessage | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessage = messages[i];
        break;
      }
    }
    
    // 找到 system prompt
    const systemMessage = messages.find(msg => msg.role === 'system');
    
    debugPrompts = {
      systemPrompt: sanitizeText(systemMessage?.content || ''),
      userPrompt: sanitizeText(lastUserMessage?.content || ''),
      messages: messages.map(msg => ({
        role: msg.role,
        content: sanitizeText(msg.content),
      })),
      ...(skillMode !== 'off' && skillSelections.length > 0 && {
        selectedSkillIds: skillSelections.map(s => s.skillId),
        selectionReason: skillSelectionReasons.join('; '),
        slotValues: skillSelections.reduce((acc, s) => ({ ...acc, [s.skillId]: s.slotValues }), {}),
      }),
    };
  }

  // 性能优化：压缩输出量，目标 < 8s
  // 优化策略：
  // 1. 降低 max_tokens 从 480 到 400，减少生成时间
  // 2. 修复调用使用更短的 max_tokens（只需补充缺失部分）
  // 3. 优化 JSON 解析失败的处理，避免误触发修复
  
  // 任务 A：分段耗时打点
  const perfTimers = {
    t_llm_main: 0,
    t_parse: 0,
    t_gate_text: 0,
    t_gate_cards: 0,
    t_sanitize: 0,
    t_repair: 0,
  };
  
  // t_llm_main: 主 LLM 调用
  const t_llm_main_start = Date.now();
  let fullReply: string;
  let textPart: string;
  let actionCards: ActionCard[] = [];
  const originalActionCards: ActionCard[] = [];

  // 根据 SKILL_MODE 决定是否调用 LLM 以及如何处理
  if (skillMode === 'steps_and_cards' && skillSelections.length > 0) {
    // steps_and_cards 模式：LLM 只生成【初筛总结】和【风险与分流】
    // 修改 prompt，不要求【下一步清单】和 actionCards
    const skillSystemPrompt = ASSESSMENT_CONCLUSION_PROMPT.replace(
      /3\. \*\*【下一步清单】\*\*/,
      '3. **【下一步清单】**（由 Skill 系统生成，此处跳过）'
    ).replace(
      /\*\*Action Cards（必须JSON）\*\*/,
      '**Action Cards（由 Skill 系统生成，此处跳过）**'
    );
    
    const skillMessages: ChatMessage[] = [
      {
        role: 'system',
        content: skillSystemPrompt + '\n\n注意：你只需要生成【初筛总结】和【风险与分流】两个区块，不需要生成【下一步清单】和 actionCards JSON。',
      },
      ...(shouldIncludeHistory ? history.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })) : []),
      {
        role: 'user',
        content: `初始主诉：${initialMessage}\n\n对评估问题的回答：${cleanedFollowupAnswer}`,
      },
    ];

    fullReply = await chatCompletion(skillMessages, {
      temperature: 0.3,
      max_tokens: 200, // 减少 token，因为不需要生成清单和 JSON
    });
    textPart = fullReply.trim();
    
    // 收口动作1：确保 LLM 不生成【下一步清单】和 actionCards
    // 如果 LLM 仍然生成了【下一步清单】，移除它（确保完全由 Skill 系统生成）
    textPart = textPart.replace(/【下一步清单】[\s\S]*?(?=【|$)/g, '').trim();
    // 如果 LLM 仍然生成了 actionCards JSON，移除它（确保完全由 Skill 系统生成）
    textPart = removeActionCardsFromReply(textPart);
    
    // 使用 Skill 系统生成 nextSteps 和 actionCards
    const skillOutput = renderSkills(skillSelections);
    
    // 将 nextSteps 追加到 textPart（完全由 Skill 系统生成）
    if (skillOutput.nextStepsLines.length > 0) {
      textPart += '\n\n【下一步清单】\n';
      skillOutput.nextStepsLines.forEach((line, idx) => {
        textPart += `${idx + 1}. ${line}\n`;
      });
    }
    
    // 使用 Skill 生成的 actionCards（完全由 Skill 系统生成）
    actionCards = skillOutput.actionCards;
  } else {
    // off 或 cards_only 模式：正常调用 LLM
    fullReply = await chatCompletion(messages, {
      temperature: 0.3,
      max_tokens: 300,
    });
    
    // t_parse: 解析 reply + actionCards JSON
    textPart = removeActionCardsFromReply(fullReply);
    
    if (skillMode === 'cards_only' && skillSelections.length > 0) {
      // cards_only 模式：使用 Skill 生成的 actionCards，但保留 LLM 生成的文本
      const skillOutput = renderSkills(skillSelections);
      actionCards = skillOutput.actionCards;
      console.log(`[Skill] cards_only mode: Using skill-generated actionCards (${actionCards.length} cards)`);
    } else {
      // off 模式：使用 LLM 生成的 actionCards
      actionCards = extractActionCards(fullReply);
    }
    
    const originalActionCardsInternal = JSON.parse(JSON.stringify(actionCards));
    originalActionCards.push(...originalActionCardsInternal);
  }
  
  perfTimers.t_llm_main = Date.now() - t_llm_main_start;
  
  const t_parse_start = Date.now();
  // 如果还没保存 originalActionCards，现在保存（仅用于 off 模式的日志）
  if (skillMode === 'off' && actionCards.length > 0) {
    const originalActionCardsInternal = JSON.parse(JSON.stringify(actionCards));
    originalActionCards.push(...originalActionCardsInternal);
  }
  perfTimers.t_parse = Date.now() - t_parse_start;
  
  // 门禁校验（仅在 GATE_FIX !== '0' 时启用）
  let gateResult: GateResult | null = null;
  let actionCardsGateResult: GateResult | null = null;
  let fixed = false;
  let repairTriggered = false;
  
  if (process.env.GATE_FIX !== '0') {
    // t_gate_text: 区块标题/清单门禁
    const t_gate_text_start = Date.now();
    gateResult = gateAssessment(textPart);
    perfTimers.t_gate_text = Date.now() - t_gate_text_start;
    
    // 先 sanitize actionCards，再 gate（任务 D：流程顺序确认）
    // 对于 Skill 生成的 actionCards，理论上应该已经符合约束，但仍需 sanitize 以确保
    const t_sanitize_start = Date.now();
    actionCards = sanitizeActionCards(actionCards);
    perfTimers.t_sanitize = Date.now() - t_sanitize_start;
    
    // t_gate_cards: actionCards steps 门禁
    const t_gate_cards_start = Date.now();
    actionCardsGateResult = gateActionCardsSteps(actionCards);
    perfTimers.t_gate_cards = Date.now() - t_gate_cards_start;
    
      // 任务 E：输出 gate 失败时的详细日志（step 原文与 sanitize 后结果）
      if (!actionCardsGateResult.pass && actionCardsGateResult.details?.invalidSteps) {
        console.log(`[Gate] ActionCards steps 门禁失败详情：`);
        actionCardsGateResult.details.invalidSteps.forEach((invalid: any) => {
          const cardIdx = invalid.cardIndex - 1;
          const stepIdx = invalid.stepIndex - 1;
          // 对于 Skill 生成的 actionCards，originalActionCards 可能为空，使用 sanitize 前的 actionCards
          const originalStep = originalActionCards[cardIdx]?.steps?.[stepIdx] || actionCards[cardIdx]?.steps?.[stepIdx] || 'N/A';
          const sanitizedStep = actionCards[cardIdx]?.steps?.[stepIdx] || 'N/A';
          console.log(`  - 卡片 ${invalid.cardIndex} 步骤 ${invalid.stepIndex}:`);
          console.log(`    原文: "${originalStep}"`);
          console.log(`    sanitize后: "${sanitizedStep}"`);
          console.log(`    失败原因: ${invalid.reason}`);
        });
      }
    
    // 合并两个门禁的结果
    const allMissing = [
      ...(gateResult.missing || []),
      ...(actionCardsGateResult.missing || []),
    ];
    const combinedPass = gateResult.pass && actionCardsGateResult.pass;
    
    // 如果不通过，触发修复（但尽量缩短修复调用时间）
    if (!combinedPass) {
      const missingForLog = allMissing.length > 0 ? allMissing.join(', ') : '未知';
      console.log(`[Gate] Assessment conclusion failed, missing: ${missingForLog}`);
      console.log(`[Gate] Attempting repair...`);
      
      // t_repair: repair LLM 调用
      const t_repair_start = Date.now();
      repairTriggered = true;
      
      // 只重生成 actionCards JSON（不要重生成全文）
      const fixerMessages: ChatMessage[] = [
        {
          role: 'system',
          content: '只输出修复后的 actionCards JSON，无任何文字。每条 step ≤16汉字（只计汉字），必须含时长/次数/触发器。强制使用短格式：吸气4秒×5次、走动3分钟、写下3条担心。禁止抽象句。',
        },
        {
          role: 'user',
          content: `缺失：${actionCardsGateResult.missing.join('；')}\n当前：\n${JSON.stringify(actionCards, null, 2)}`,
        },
      ];
      
      try {
        const fixedActionCardsJson = await chatCompletion(fixerMessages, {
          temperature: 0.3,
          max_tokens: 250, // 只需要 actionCards JSON，更短
        });
        
        // 提取修复后的 actionCards
        const fixedActionCards = extractActionCards(fixedActionCardsJson);
        if (fixedActionCards.length > 0) {
          // 任务 D：repair 后再次 sanitize 和 gate
          const sanitizedActionCards = sanitizeActionCards(fixedActionCards);
          const fixedActionCardsGateResult = gateActionCardsSteps(sanitizedActionCards);
          
          // 输出 repair 后的 gate 失败详情
          if (!fixedActionCardsGateResult.pass && fixedActionCardsGateResult.details?.invalidSteps) {
            console.log(`[Gate] Repair 后仍失败详情：`);
            fixedActionCardsGateResult.details.invalidSteps.forEach((invalid: any) => {
              const cardIdx = invalid.cardIndex - 1;
              const stepIdx = invalid.stepIndex - 1;
              const repairStep = fixedActionCards[cardIdx]?.steps?.[stepIdx] || 'N/A';
              const sanitizedStep = sanitizedActionCards[cardIdx]?.steps?.[stepIdx] || 'N/A';
              console.log(`  - 卡片 ${invalid.cardIndex} 步骤 ${invalid.stepIndex}:`);
              console.log(`    repair后: "${repairStep}"`);
              console.log(`    sanitize后: "${sanitizedStep}"`);
              console.log(`    失败原因: ${invalid.reason}`);
            });
          }
          
          if (fixedActionCardsGateResult.pass) {
            console.log(`[Gate] Repair successful, actionCards gate passed`);
            actionCards = sanitizedActionCards;
            actionCardsGateResult = fixedActionCardsGateResult;
            fixed = true;
          } else {
            console.log(`[Gate] Repair attempted but still failed, missing: ${fixedActionCardsGateResult.missing.join(', ')}`);
            actionCards = sanitizedActionCards;
            actionCardsGateResult = fixedActionCardsGateResult;
            fixed = true;
          }
        }
      } catch (error) {
        console.error(`[Gate] Repair failed with error:`, error);
        // 修复失败，使用 sanitize 后的原始输出
      }
      
      perfTimers.t_repair = Date.now() - t_repair_start;
    } else {
      console.log(`[Gate] Assessment conclusion passed`);
    }
    
    // 合并最终的门禁结果
    if (gateResult && actionCardsGateResult) {
      const finalMissing = [
        ...(gateResult.missing || []),
        ...(actionCardsGateResult.missing || []),
      ];
      const finalPass = gateResult.pass && actionCardsGateResult.pass;
      
      gateResult = {
        pass: finalPass,
        missing: finalMissing,
        details: {
          ...gateResult.details,
          actionCards: actionCardsGateResult.details,
        },
      };
    }
  }

  // 最终提取结果
  let reply: string;
  if (skillMode === 'steps_and_cards') {
    // steps_and_cards 模式：textPart 已经包含了完整的文本（包括 nextSteps）
    reply = textPart;
  } else {
    // off 或 cards_only 模式：使用 LLM 生成的文本
    reply = removeActionCardsFromReply(fullReply);
  }
  
  // 输出性能日志（高可读格式，不泄露隐私）
  const totalTime = perfTimers.t_llm_main + perfTimers.t_parse + perfTimers.t_gate_text + 
                    perfTimers.t_gate_cards + perfTimers.t_sanitize + perfTimers.t_repair;
  console.log(`[Perf] conclusion timing: total=${totalTime}ms | llm_main=${perfTimers.t_llm_main}ms | parse=${perfTimers.t_parse}ms | gate_text=${perfTimers.t_gate_text}ms | gate_cards=${perfTimers.t_gate_cards}ms | sanitize=${perfTimers.t_sanitize}ms | repair=${perfTimers.t_repair}ms | repairTriggered=${repairTriggered}`);

  return {
    reply,
    actionCards,
    ...(gateResult && {
      gate: {
        pass: gateResult.pass,
        fixed,
        missing: gateResult.missing,
      },
    }),
    ...(debugPrompts && { debugPrompts }),
    // 仅在 dev 环境返回 perf 数据
    ...(process.env.NODE_ENV === 'development' && {
      perf: {
        total: totalTime,
        llm_main: perfTimers.t_llm_main,
        parse: perfTimers.t_parse,
        gate_text: perfTimers.t_gate_text,
        gate_cards: perfTimers.t_gate_cards,
        sanitize: perfTimers.t_sanitize,
        repair: perfTimers.t_repair,
        repairTriggered,
      },
    }),
  };
}

