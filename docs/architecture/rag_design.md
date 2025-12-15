# RAG (Retrieval-Augmented Generation) 架构设计方案

## 1. 设计原则
针对心理疗愈场景，我们的 RAG 设计遵循以下原则：
1.  **置信度优先 (High Confidence)**：危机干预热线、医疗资源必须 100% 准确，不依赖概率性检索，使用确定性查表（Look-up）。
2.  **去课本化 (De-textbook)**：检索回来的知识只作为“事实核查器 (Fact Checker)”和“灵感库”，严禁 AI 直接复制粘贴原文。
3.  **意图驱动 (Intent-Driven)**：不搞盲目的全文相似度检索，而是基于 `Intent Classification` 的结果去调取特定领域的知识。

## 2. 知识库结构 (Knowledge Base Structure)

我们将分为三个核心库，初期以本地 JSON/Markdown 文件存储，确保可控性：

### A. 刚性资源库 (Hard Resources) - `data/resources/contacts.json`
*   **内容**：全国/分地区的 24h 心理热线、报警电话、精神专科医院名录。
*   **检索方式**：完全匹配检索 (Deterministic)。
*   **场景**：当 `Crisis Intent` 命中时，根据用户 IP 或自述地区强制提取。

### B. 科普与话术库 (Psycho-education) - `data/resources/education/*.md`
*   **内容**：经过“口语化”处理的症状解释（如：惊恐发作生理机制）、误区澄清（如：抑郁症不是矫情）。
*   **检索方式**：关键词/语义检索。
*   **场景**：当用户出现 `shouldAssessment=true` 或询问特定症状时调用。

### C. 疗法工具库 (Therapy Tools) - `data/resources/exercises.json`
*   **内容**：CBT/DBT/ACT 的标准化练习步骤（如“着地练习 5-4-3-2-1”）。
*   **检索方式**：意图匹配。
*   **场景**：当系统决定给出 `ActionCard` 时，检索对应的具体步骤详情。

## 3. 系统架构流向

```mermaid
graph TD
    UserInput[用户输入] --> Classifier{意图分类}
    
    %% 分流检索
    Classifier -- "危机 (Crisis)" --> FetchContacts[检索: 刚性资源库]
    Classifier -- "询问/症状 (Query)" --> FetchEdu[检索: 科普库]
    Classifier -- "行动 (Action)" --> FetchTools[检索: 疗法工具库]
    
    %% 组装 Context
    FetchContacts --> ContextBuilder[Context 组装器]
    FetchEdu --> ContextBuilder
    FetchTools --> ContextBuilder
    
    %% Prompt 注入
    ContextBuilder --> SystemPrompt[Inject System Prompt]
    
    subgraph PromptEngineering [Prompt 策略]
        P1[指令: "参考以下事实..."]
        P2[指令: "转化温暖口语..."]
        P3[指令: "禁止引用来源..."]
    end
    
    SystemPrompt --> DeepSeek[LLM 生成]
    DeepSeek --> FinalReply[更加专业且自然的回复]
```

## 4. 实现步骤 (Implementation Plan)

1.  **数据层**：
    *   创建 `lib/data/` 目录。
    *   整理首批可靠的 `contacts.json` 和 `cbt-guides.json`。

2.  **服务层 (`lib/rag/`)**：
    *   实现 `ResourceService`，提供 `getHotlines()`, `getTherapyGuide(topic)` 等方法。
    *   (可选项) 如果内容变多，接入简单的向量检索 (如 `minisearch` 本地库)，暂不引入重型 Vector DB。

3.  **路由层 (`route.ts`)**：
    *   在 `classifyIntent` 之后，根据分类结果调用 `ResourceService`。
    *   将获取到的 `ragContext` 字符串传递给 `streamSuccessReply`。

4.  **Prompt 优化**：
    *   修改 `SUPPORT_PROMPT` 和 `CRISIS_PROMPT`，增加 `{{RAG_CONTEXT}}` 插槽。
    *   编写“去文本化”指令，强制 AI 进行风格重写。

## 5. 预期效果示例

*   **用户**：“我突然心跳好快，是不是要死了？”
*   **原版 AI**：“别担心，深呼吸。”（略显单薄）
*   **RAG AI**：（检索到《惊恐发作》条目）“这种感觉确实很吓人，但这在心理学上通常被称为‘惊恐发作’。那是你身体的警报系统太灵敏了，误报了危险。其实你的心脏即使跳得快，也是在安全范围内的。我们要不要试着骗过这个警报器？”
    *   *注：用到了原理解释，但没有生硬地念定义。*
