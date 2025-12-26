/**
 * 记忆系统Prompt模板
 * 用于LLM驱动的记忆提取和整合
 */

import { MEMORY_TOPIC_LABELS, type MemoryTopic } from './types';

/**
 * 记忆提取Prompt
 * 从对话中提取有长期价值的信息
 */
export const MEMORY_EXTRACTION_PROMPT = `你是一位心理咨询记录整理专家。分析以下对话，提取值得长期记住的关键信息。

**核心指令：原子化、去冗余、精简**
- **原子化**: 每条记忆必须是独立的事物/模式（如“用户对未来感到焦虑”，而不是一长串前因后果）。
- **去冗余**: 禁止使用“用户提到”、“用户说”、“用户似乎”等废话前缀。直接陈述事实。
- **精简**: 每条 content 不得超过 30 字。

**提取规则：**
1. **记忆点 (Memories)**: 只提取有长期价值的信息。必须包含字段 \`topic\`，取值范围：emotional_pattern, coping_preference, personal_context, therapy_progress, trigger_warning, communication_style。
2. **实体 (Entities)**: 识别关键实体。必须包含字段 \`name\` 和 \`type\` (取值：person, event, object, emotion, belief)。
3. **关系 (Relationships)**: 建立实体间关联。必须包含 \`source\`, \`target\`, \`type\` (取值：trigger, cause, correlate, prevent)。

**示例 (Good):**
- [personal_context] 用户因工作变动被老板冤枉，感到委屈。
- [emotional_pattern] 面临未来不确定性时易触发深度焦虑和思绪纷乱。

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
 * 记忆整合Prompt
 * 决定如何处理新提取的记忆与现有记忆的关系
 */
export const MEMORY_CONSOLIDATION_PROMPT = `你是记忆整合专家。比较新提取的语义记忆和现有记忆，决定如何处理它们的关联。

**核心指令：语义去重、合并优先、保持纯净**
- **语义去重**: 即使表述不同，只要意思相近（相似度 > 70%），必须判定为 skip 或 update，严禁重复创建。
- **合并优先**: 如果新记忆对旧记忆有补充，合并为一条更完整的描述，而不是保留两条。
- **冲突处理**: 如果新事实推翻了旧事实，使用 delete 删除旧记忆。

**现有记忆：**
{existingMemories}

**新提取记忆：**
{newMemory}

**决策规则：**
1. **create**: 新记忆包含全新事实或不同于现有的显著模式。
2. **update**: 新记忆对现有事实有补充或验证。
   - 需返回 merge 后的 \`mergedContent\`。
3. **delete**: 新事实证明旧记忆已过时或错误。
4. **skip**: 重复信息，或者信息量显著低于/包含在现有记忆中。

**输出格式：**
请输出 JSON：
{
  "action": "create" | "update" | "delete" | "skip",
  "targetMemoryId": "string (仅用于 update/delete)",
  "mergedContent": "string (仅用于 update，合并后的完整文本)",
  "reason": "简要解析（如：语义重合度高，已合并）"
}`;

/**
 * 格式化记忆为Prompt中的上下文
 */
export function formatMemoriesAsContext(
  memories: Array<{ id?: string; topic: string; content: string; confidence?: number }>
): string {
  if (memories.length === 0) return '（无）';

  return memories
    .map((m, i) => {
      const topicLabel = MEMORY_TOPIC_LABELS[m.topic as MemoryTopic] || m.topic;
      const idPart = m.id ? ` [ID: ${m.id}]` : '';
      const confPart = m.confidence ? ` (置信度: ${m.confidence})` : '';
      return `${i + 1}. [${topicLabel}]${idPart} ${m.content}${confPart}`;
    })
    .join('\n');
}

/**
 * 格式化检索到的记忆注入到对话System Prompt
 */
export function formatMemoriesForInjection(
  memories: Array<{
    topic: string;
    content: string;
    entities?: any;
    relationships?: any;
  }>
): string {
  if (memories.length === 0) return '';

  const sections: Record<string, string[]> = {};

  for (const m of memories) {
    const topic = MEMORY_TOPIC_LABELS[m.topic as MemoryTopic] || m.topic;
    if (!sections[topic]) sections[topic] = [];

    let entry = `- ${m.content}`;

    // 语义模式注入
    if (m.relationships && Array.isArray(m.relationships) && m.relationships.length > 0) {
      const patterns = m.relationships.map(r => `${r.source} -> [${r.type}] -> ${r.target}`);
      entry += ` (模式: ${patterns.join(', ')})`;
    }

    sections[topic].push(entry);
  }

  return `
### 用户背景记忆

以下是关于该用户的重要背景信息/模式，在回复时请参考。注意识别潜在的情感因果模式：

${Object.entries(sections)
      .map(([topic, items]) => `**${topic}:**\n${items.join('\n')}`)
      .join('\n\n')}

注意：自然地融入对话，不要显式提及"根据记录"或具体的"模式/关系"术语。
`;
}

/**
 * 对话摘要Prompt
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
- 直接返回摘要文本，不要包含“这是摘要”等废话。`;
