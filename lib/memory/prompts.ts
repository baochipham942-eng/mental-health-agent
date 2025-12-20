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

**提取规则：**
1. **记忆点 (Memories)**: 只提取有长期价值的信息。必须包含字段 \`topic\`，取值范围：emotional_pattern, coping_preference, personal_context, therapy_progress, trigger_warning。
2. **实体 (Entities)**: 识别关键实体。必须包含字段 \`name\` 和 \`type\` (取值：person, event, object, emotion, belief)。
3. **关系 (Relationships)**: 建立实体间关联。必须包含 \`source\`, \`target\`, \`type\` (取值：trigger, cause, correlate, prevent)。

**输出格式要求：**
- 必须返回纯 JSON 对象。
- 结构如下：
{
  "memories": [
    {
      "topic": "emotional_pattern",
      "content": "一句话描述",
      "confidence": 0.9,
      "entities": [{"name": "加班", "type": "event"}],
      "relationships": [{"source": "加班", "target": "焦虑", "type": "trigger"}]
    }
  ]
}

**重要：** 如果无价值信息，返回 {"memories": []}。始终使用第二人称“用户”称呼来访者。`;

/**
 * 记忆整合Prompt
 * 决定如何处理新提取的记忆与现有记忆的关系
 */
export const MEMORY_CONSOLIDATION_PROMPT = `你是记忆整合专家。比较新提取的语义记忆和现有记忆，决定如何处理它们的关联。

**现有记忆：**
{existingMemories}

**新提取记忆（含实体及模式）：**
{newMemory}

**决策规则：**
1. **create**: 新记忆包含全新事实或不同于现有的因果关系。
2. **update**: 新记忆对现有事实有补充、细节更新，或验证了某种推断模式。
   - 需合并 content, entities 和 relationships。
3. **delete**: 新事实证明旧记忆已过时或错误。
4. **skip**: 重复信息或信息量显著低于现有记忆。

**输出格式：**
请输出 JSON：
{
  "action": "create" | "update" | "delete" | "skip",
  "targetMemoryId": "string (仅用于 update/delete)",
  "mergedContent": "string (仅用于 update)",
  "reason": "简要解析"
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
