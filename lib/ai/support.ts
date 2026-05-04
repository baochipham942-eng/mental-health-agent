import { generateText, type ChatMessage, type LlmProviderName } from '@/lib/llm';
import { UI_TOOLS } from './tools';
import { IDENTITY_PROMPT } from './prompts';
import { buildSystemPrompt as buildAdaptivePrompt, AdaptiveMode } from './persona-manager';
import { getCounselorAgent } from './agents/counselor-agent';
import { getSupportLlmProvider } from '@/lib/llm/config';
import * as crypto from 'crypto';

// Sprint 3: Prompt 版本注册（内存缓存避免每次请求都查 DB）
const _registeredHashes = new Set<string>();
function lazyRegisterPrompt(name: string, content: string) {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  if (_registeredHashes.has(hash)) return;
  _registeredHashes.add(hash);
  // 异步注册，不阻塞主流程
  import('@/lib/eval/prompt-version').then(({ registerPrompt }) => {
    registerPrompt(name, content).catch(() => {});
  }).catch(() => {});
}

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
3. **篇幅**：控制在 2-4 句话，保持对话节奏；不要重复任何句子或段落

**技能卡片触发规则（最高优先级）**：
1. **明确请求（Explicit）**：用户直接说"我想做个练习"、"我也要试那个空椅子" → 可以直接调用工具。
2. **场景触发包（Implicit / Proactive）**：
   当用户倾诉匹配以下场景时，先用 1-2 句文本回应用户的感受；如果推荐练习，再调用对应工具卡片，不要只输出工具卡片。

   🏢 **职场急救包**（工作压力、和领导/同事冲突、加班崩溃、被批评、裁员焦虑）
      → 推荐 **4-7-8呼吸法** (widget: breathing) 或 **认知重构** (widget: reframing)
      → 话术示例："工作上的事确实让人窒息… 要不要先跟我一起做几个深呼吸，把紧绷的身体松一松？"

   🌙 **入睡安眠包**（失眠、睡不着、翻来覆去、心跳快、脑子停不下来）
      → 推荐 **4-7-8呼吸法** (widget: breathing)
      → 话术示例："睡不着的夜晚真的很煎熬。有个呼吸小练习，很多人说做完就犯困了，要不要试试？"

   💔 **心结化解包**（放不下一个人/一件事、委屈、遗憾、想对某人说话、分手/离别）
      → 推荐 **空椅子技术** (widget: empty_chair)
      → 话术示例："有些话憋在心里一定很难受。有个方式可以让你把想说的话说出来，要不要试试？"

   🌀 **思绪整理包**（想太多、脑子乱、反复纠结、感觉很糟但不清楚原因）
      → 推荐 **思绪落叶** (widget: leaves_stream) 或 **正念冥想** (widget: meditation)
      → 话术示例："脑袋里乱糟糟的时候，试着把那些念头一个个放到落叶上漂走，可能会轻松一些。"

   - **限制**：每 5 轮对话最多主动推荐 1 次，避免打扰。同一次对话中可以多次推荐不同技能。

- ❌ **绝对禁止**在文本中写出具体练习步骤（如"吸气4秒..."）。练习步骤必须通过 \`recommend_skill_card\` 工具渲染。

**结束信号识别（最高优先级）**：
当用户发出以下结束信号时，**必须顺应并温暖收尾**，绝不继续追问或给新建议：
- 明确告别："再见"、"拜拜"、"我先走了"、"下次再聊"、"bye"、"goodbye"
- 感谢收尾："谢谢"、"谢谢你"、"感谢你的陪伴"、"thanks"、"thank you"
- 隐含结束："好多了"、"我去忙了"、"先这样吧"、"够了"、"就到这吧"

收尾回复要求：
1. 简短肯定用户（"很高兴能陪你聊这些"）
2. 可选：一句话回顾核心感受（不展开新话题）
3. 温暖告别（"随时欢迎回来"）
4. **篇幅不超过 3 句**，不追加提问或建议

❌ 错误示例：用户说"谢谢" → AI 回复"我感受到你内心深处的痛苦，我们可以继续聊聊..."
✅ 正确示例：用户说"谢谢" → AI 回复"**很高兴今天能陪你聊这些** 💙 随时想聊都可以来找我。"

**严禁行为**：
- ❌ 不要在支持模式下进行结构化 SCEB 评估
- ❌ 不要在用户分享日常生活、正面或中性事件时突然询问安全问题
- ❌ 不要一次性列出多个问题（审讯感）
- ❌ 用户已明确表达意图时，不要反复追问（如用户说"想做呼吸练习"，直接给练习）
- ❌ 用户已发出结束信号时，不要继续延展话题或给新建议

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

**实验室探索推荐规则**：
- 当用户话题匹配以下模式时，可调用 \`recommend_lab_exploration\` 推荐实验室探索：
  - 认知僵化/思维打不开/反复纠结同一问题 → 推荐 **wisdom**（荣格或苏格拉底对话）
  - 自我认同困惑/"我是谁"/"不了解自己" → 推荐 **mirrors**（MBTI 镜像探索）
  - 决策困难/两难选择/需要多角度分析 → 推荐 **group**（圆桌论道）
- **限制**：每 5 轮对话最多推荐 1 次，不与 \`recommend_skill_card\` 同时触发。
- **话术**：以"换个视角"、"有个好玩的方式"等轻松语气引入，不说"你需要"或"建议你去"。

**允许行为**：
- ✅ 如果用户表达模糊（如"我有点累"），可以温和询问是否需要帮助
- ✅ 如果用户表现出明确的痛苦信号，可以表达更多关心

**防依赖引导**：
- 当对话持续较长（超过 10 轮）且用户情绪有所缓解时，可以自然地建议用户去做一些线下活动
- 话术示例："感觉你好一点了，今天出门走走或者听听音乐怎么样？"
- 不要在用户情绪低谷时提这类建议，也不要强制中断对话
- 如果用户当天已经多次对话，可以温和提醒："今天已经聊了不少了，有没有试试之前说的方法？"

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

  const result = await generateText(messages, {
    provider: getSupportLlmProvider(),
    temperature: 0.8,
    max_tokens: 400,
    tools: UI_TOOLS as unknown as any[],
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
    adaptiveMode?: AdaptiveMode;
    therapistId?: string;
    userPreferences?: string[];
    providerOverride?: LlmProviderName;
    modelOverride?: string;
  }
) {
  const finalSystemPrompt = options?.adaptiveMode
    ? buildAdaptivePrompt(SUPPORT_PROMPT, options.adaptiveMode, options.therapistId, options.userPreferences)
    : SUPPORT_PROMPT;

  // Sprint 3: 懒注册 Prompt 版本（内存去重，仅新内容触发 DB 写入）
  lazyRegisterPrompt('support_prompt', finalSystemPrompt);

  const result = await getCounselorAgent().run({
    message: userMessage,
    history: history as ChatMessage[],
    provider: options?.providerOverride || getSupportLlmProvider(),
    systemPrompt: `${finalSystemPrompt}${options?.systemInstructionInjection ? `\n\n${options.systemInstructionInjection}` : ''}`,
    memoryContext: options?.memoryContext,
    onFinish: options?.onFinish,
    enableTools: true,
    traceMetadata: options?.traceMetadata,
    adaptiveMode: options?.adaptiveMode,
    modelOverride: options?.modelOverride,
    temperature: 0.8,
    maxTokens: 400,
  });

  if (!result.success || !result.data?.streamResult) {
    throw new Error(result.error || 'CounselorAgent failed to stream support reply');
  }

  return result.data.streamResult;
}
