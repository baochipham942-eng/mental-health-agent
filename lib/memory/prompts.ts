/**
 * 记忆系统 Prompt 模板（V2 精简版）
 * 仅保留 extractor 和 summarizer 使用的 prompt
 */

/**
 * 记忆提取 Prompt
 * 从对话中提取有长期价值的信息
 */
export const MEMORY_EXTRACTION_PROMPT = `你是一位心理咨询记录整理专家。分析以下对话，提取值得长期记住的关键信息。

**核心指令：原子化、去冗余、精简**
- **原子化**: 每条记忆必须是独立的事物/模式（如"用户对未来感到焦虑"，而不是一长串前因后果）。
- **去冗余**: 禁止使用"用户提到"、"用户说"、"用户似乎"等废话前缀。直接陈述事实。
- **精简**: 每条 content 不得超过 30 字。

**提取规则：**
1. **记忆点 (Memories)**: 只提取有长期价值的信息。必须包含字段 \`topic\`，取值范围：
   - emotional_pattern: 情绪模式（触发因素、常见情绪反应）
   - coping_preference: 应对偏好（用户认可的放松/应对策略）
   - personal_context: 个人背景（重要的家庭、工作等信息）
   - therapy_progress: 疗愈进展（改善或退步迹象）
   - trigger_warning: 触发预警（敏感话题或需要避免的内容）
   - communication_style: 沟通风格（用户偏好的交流方式）
   - relationship_dynamics: 人际关系动态（重要人际关系及互动模式）
   - core_belief: 核心信念（深层价值观、自我认知，如"我不够好"）
   - strength_resource: 优势资源（用户的长处、支持系统、积极品质）
   - exercise_preference: 练习偏好（喜欢/完成过的练习类型，匹配模式：/我完成了.*练习/）
   - crisis_history: 危机历史（过往危机事件记录，如自伤、严重情绪崩溃）
   - life_event: 生活事件（重大生活变化，如搬家、离职、分手、亲人离世）
2. **实体 (Entities)**: 识别关键实体。必须包含字段 \`name\` 和 \`type\` (取值：person, event, object, emotion, belief)。
3. **关系 (Relationships)**: 建立实体间关联。必须包含 \`source\`, \`target\`, \`type\` (取值：trigger, cause, correlate, prevent)。

**示例 (Good):**
- [personal_context] 用户因工作变动被老板冤枉，感到委屈。
- [emotional_pattern] 面临未来不确定性时易触发深度焦虑和思绪纷乱。
- [relationship_dynamics] 与母亲关系紧张，常因学业问题产生冲突。
- [core_belief] 认为自己"不值得被爱"。
- [strength_resource] 有稳定的好友圈，擅长绘画作为情绪出口。
- [exercise_preference] 完成了正念呼吸练习，反馈感觉放松。
- [crisis_history] 半年前曾有过自伤行为。
- [life_event] 近期经历了分手，情绪波动较大。

**输出格式要求：**
- 必须返回纯 JSON 对象。
- 结构如下：
{
  "memories": [
    {
      "topic": "emotional_pattern",
      "content": "面临未来不确定性时易触发深度焦虑。",
      "confidence": 0.9,
      "entities": [{"name": "未来不确定性", "type": "event"}],
      "relationships": [{"source": "未来不确定性", "target": "焦虑", "type": "trigger"}]
    }
  ]
}

**重要：** 如果无价值信息，返回 {"memories": []}。`;

/**
 * 对话摘要 Prompt
 * 用于将长对话压缩为精炼的上下文摘要
 */
export const CONVERSATION_SUMMARIZATION_PROMPT = `你是一位咨询记录专家。请将以下对话历史压缩为一段简明扼要的摘要（不超过300字）。

**要求：**
1. **核心诉求**：用户来访的主要原因或困扰。
2. **关键进展**：目前谈到了哪些内容，达成了什么共识。
3. **情绪状态**：用户在对话过程中表现出的主要情绪。
4. **遗留问题**：还需要进一步探讨或解决的问题。

**约束：**
- 使用第三人称（咨询师/用户）。
- 保持客观、专业，不要包含具体的建议内容。
- 直接返回摘要文本，不要包含"这是摘要"等废话。`;
