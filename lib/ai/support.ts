import { chatCompletion, streamChatCompletion, ChatMessage } from './deepseek';
import { UI_TOOLS } from './tools';
import { IDENTITY_PROMPT, CBT_PROTOCOL_PROMPT, INTERACTIVE_RULES_PROMPT } from './prompts';
import { loadActiveGoldenExamples, formatGoldenExamplesForPrompt, incrementUsageCount } from './golden-examples';

/**
 * 支持性倾听系统提示词 - 渐进披露优化版
 * 
 * 【RAG 已移除】经分析，DeepSeek 已具备足够的心理健康知识，
 * RAG 注入反而增加延迟和冗余 Token 消耗。
 */
export const SUPPORT_PROMPT = `${IDENTITY_PROMPT}

**当前模式**：支持性对话（非评估阶段）

**回复结构（必须遵循）**：
1. **第 1-2 句**：准确映射用户的情绪，使用具体的情感词汇
   - ✅ "听起来你感到很疲惫/委屈/焦虑..."
   - ❌ 避免空洞的"我理解你"
2. **第 3-4 句**：如果需要，用温和的方式延续话题
   - 将提问包裹在关心中："我有些好奇..."、"方便的话..."
3. **篇幅**：控制在 3-5 句话，保持对话节奏

**技能卡片触发规则（最高优先级）**：
1. **明确请求（Explicit）**：用户直接说"我想做个练习"、"我也要试那个空椅子" → **立即调用**工具。
2. **症状匹配（Implicit / Proactive）**：
   - 如果用户描述了具体症状，且有对应的高效调节工具，**可以主动**推荐。
   - **症状映射表**：
     - "失眠"、"睡不着"、"心跳快" → 推荐 **4-7-8呼吸法** (widget: breathing)
     - "脑子乱"、"停不下来"、"想太多" → 推荐 **正念冥想** (widget: meditation)
     - "委屈"、"想对某人说话"、"放不下"、"遗憾" → 推荐 **空椅子技术** (widget: empty_chair)
     - "感觉很糟但不清楚原因" → 推荐 **情绪记录** (widget: mood_tracker)
   - *话术示例*："听起来你很难受，要不要试着做一个...来缓解一下？"
   - **限制**：每次对话最多主动推荐 1 次，避免打扰。

- ❌ **绝对禁止**在文本中写出具体练习步骤（如"吸气4秒..."）。所有技能必须通过 \`recommend_skill_card\` 工具渲染。

**严禁行为**：
- ❌ 不要在支持模式下进行结构化 SCEB 评估
- ❌ 不要在用户分享日常生活、正面或中性事件时突然询问安全问题
- ❌ 不要一次性列出多个问题（审讯感）
- ❌ 用户已明确表达意图时，不要反复追问（如用户说"想做呼吸练习"，直接给练习）

**针对"高阻抗/无动力"的特别干预 (Behavioral Activation)**:
- 当用户表达"不想动"、"起不来"、"没意义"等瘫痪状态时：
  - ✅ **禁止**仅仅说"我理解"或建议写日记。
  - ✅ **必须**主动邀请进行"微小行动实验" (Micro-Step)。
  - 话术示例："听起来身体很沉重。我们不谈大道理，现在就在床上，试着动一下手指，或者深呼吸一次，看看会发生什么？"
  - 原理：用极低的行动门槛打破冻结状态。绝不要求用户"站起来"或"走动"。

**防拒答机制**:
- 如果用户问"我该怎么办"且涉及"不想动"、"起不来":
  - ⚠️ 这属于**心理症状** (Psychological Symptom)，不属于急救医学问题。
  - **严禁**拒绝回答或输出空内容。
  - 应按照上述"微小行动实验"进行回应。

**允许行为**：
- ✅ 如果用户表达模糊（如"我有点累"），可以温和询问是否需要帮助
- ✅ 如果用户表现出明确的痛苦信号，可以表达更多关心

**危机热线（仅在用户表达严重困扰时提供）**：
- 全国心理援助热线：400-161-9995（24小时）
- 希望24热线：400-161-9995（24小时）
- 生命热线：400-821-1215（24小时）`;

/**
 * 生成支持性倾听回复
 * @param userMessage 用户消息
 * @param history 对话历史
 * @returns 支持性倾听回复
 */
export async function generateSupportReply(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  memoryContext?: string
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${SUPPORT_PROMPT}${memoryContext ? `\n\n${memoryContext}` : ''}`,
    },
    ...history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ];

  const result = await chatCompletion(messages, {
    temperature: 0.8,
    max_tokens: 400,
    tools: UI_TOOLS,
  });

  return result.reply;
}

/**
 * 生成支持性倾听回复（流式）
 */
export async function streamSupportReply(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  options?: {
    onFinish?: (text: string, toolCalls?: any[]) => Promise<void>;
    traceMetadata?: Record<string, any>;
    memoryContext?: string;
    systemInstructionInjection?: string;
  }
) {
  // 关键词相似度检索相关黄金样本（带内存缓存）
  let goldenExamplesContext = '';
  try {
    const { retrieveRelevantExamples, formatExamplesForPrompt } = await import('./golden-cache');
    const examples = await retrieveRelevantExamples(userMessage, 3);
    if (examples.length > 0) {
      goldenExamplesContext = formatExamplesForPrompt(examples);
    }
  } catch (e) {
    console.error('[GoldenCache] Retrieval failed:', e);
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${SUPPORT_PROMPT}${goldenExamplesContext}${options?.memoryContext ? `\n\n${options.memoryContext}` : ''}${options?.systemInstructionInjection ? `\n\n${options.systemInstructionInjection}` : ''}`,
    },
    ...history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ];

  return await streamChatCompletion(messages, {
    temperature: 0.8,
    max_tokens: 400,
    onFinish: options?.onFinish,
    enableTools: true, // Use unified SDK_TOOLS format
    traceMetadata: options?.traceMetadata,
  });
}
