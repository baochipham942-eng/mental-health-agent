# 隐性动态人格设计方案 (Adaptive Persona Design)

> **核心理念**：把“选择咨询师”的权利交给专业的评估系统，而不是交给疲惫的用户。Clark 表面上永远是那个 Clark，但他的“说话方式”会根据用户的状态自动微调。

## 1. 设计背景

目前的 `SUPPORT_PROMPT` 是一个通过 Golden Case 打磨的“通用高分”人设。但在实际心理咨询中，咨询师会根据来访者的阶段切换姿态：
*   对**高危/极度痛苦**的来访者：提供**抱持性环境 (Holding)**，无限包容，不做挑战。
*   对**抑郁/动力不足**的来访者：提供**温和的行为激活**，不只是倾听，还要推动微小的改变。
*   对**恢复期/认知偏差**的来访者：提供**苏格拉底式提问**，适度挑战其非理性信念。

如果不进行区分，单一 Prompt 可能会：
*   对重度用户太“推”（导致挫败感）。
*   对轻度用户太“软”（导致共情反刍，无实质进展）。

## 2. 核心模型：4 种适性模式 (Adaptive Modes)

我们不通过 UI 切换“角色”，而是在底层切换 **Interaction Style（交互风格指令）**。

| 模式名称 | 适用场景 | 核心姿态 | 语气关键词 | Prompt 指令摘要 |
| :--- | :--- | :--- | :--- | :--- |
| **守护者 (Guardian)** | 高风险、极度悲伤、应激状态 | **绝对安全 & 抱持** | 缓慢、温暖、稳定 | `Tone: Ultra-safe, validating. No challenging questions. Focus on grounding & stabilization.` |
| **陪伴者 (Companion)** | 初次访客、情绪宣泄期 (默认模式) | **倾听 & 共情** | 柔和、耐心、接纳 | `Tone: Empathetic listening. Reflect feelings. Build trust. Use minimal encouragers.` |
| **引导者 (Guide)** | 抑郁发作期、动力不足、瘫痪状态 | **行为激活 (CBT-BA)** | 坚定、具体、微小 | `Tone: Gentle but directive on micro-steps. Breaks tasks down. Validates difficulty but encourages movement.` |
| **教练 (Coach)** | 恢复期、焦虑反刍、寻找解决方案 | **认知重构 (CBT-CR)** | 理性、敏锐、启发 | `Tone: Socratic questioning. Gently challenge negative thoughts. Focus on evidence & alternative perspectives.` |

## 3. 触发与切换机制

系统依据 **Assessment (评估)** 和 **实时意图** 进行无感切换。

### 3.1 数据源 (Inputs)
1.  **复合评估数据 (Composite Assessment Data)**
    *   **当前切片 (Latest Snapshot)**: 取最近 1 次评估分。
        *   *用途*: 决定当前的**基础风险等级** (Base Risk Level)。
    *   **纵向趋势 (Longitudinal Trend)**: 取最近 5 次（不足5次取全部）。
        *   *用途*: 决定**干预方向** (Direction)。
    *   **决策矩阵示例**:
        *   *Snapshot=中度* + *Trend=恶化* -> **Guardian** (切换为保护模式，防滑坡)。
        *   *Snapshot=中度* + *Trend=好转* -> **Guide** (切换为引导模式，趁热打铁)。
        *   *Snapshot=中度* + *Trend=平稳* -> **Companion** (维持现状)。
2.  **危机标签 (Crisis Tags)**
    *   如果有 `suicide_risk` 或 `self_harm`: 强制锁定 **GuardianMode** 并触发危机干预流程。
3.  **即时语义 (Real-time Intent)**
    *   用户说：“我起不来床”、“什么都不想做” -> 临时切换为 **Guide (行为激活)**。
    *   用户说：“我不理解为什么大家都不喜欢我” -> 临时切换为 **Coach (认知探索)**。

### 3.2 优先级逻辑
```mermaid
graph TD
    A[用户输入] --> B{检测到危机风险?}
    B -- Yes --> C[Guardian Mode (最高级)]
    B -- No --> D{检测到动力瘫痪?}
    D -- Yes --> E[Guide Mode (行为激活)]
    D -- No --> F{Check最近评估分}
    F -- PHQ9 > 15 --> C
    F -- PHQ9 < 5 --> G[Coach Mode]
    F -- 5-15 --> H[Companion Mode (默认)]
    F --> |无数据| H
```

## 4. 技术实施方案

### 4.1 新增数据结构
在 `User` 或 `Session` 层面暂存当前的 `adaptive_mode`。

### 4.2 Prompt 注入架构 (Middleware)

修改 `lib/ai/support.ts`，不再使用静态的 `SUPPORT_PROMPT`，而是采用 **"Base + Modifier"** 结构。

```typescript
// Base Prompt (通用身份与安全底座)
const BASE_PROMPT = "..."; 

// Modifiers (动态修饰符)
const MODIFIERS = {
  guardian: "Current Mode: GUARDIAN. Your priority is STABILIZATION. Do not ask users to 'think' or 'change'. Just be there. Validate their pain 100%.",
  guide: "Current Mode: GUIDE. The user is stuck. Do not just listen. Gently suggest MICRO-STEPS (e.g., 'wiggle a finger'). Be the external outcome driver.",
  coach: "Current Mode: COACH. The user is ready for change. Use Socratic questioning to explore the validity of their thoughts. Help them find alternative views.",
  companion: "Current Mode: COMPANION. Focus on building the therapeutic alliance. Reflect emotions accurately."
};

function buildSystemPrompt(userContext: UserContext) {
  const modifier = MODIFIERS[userContext.currentMode] || MODIFIERS.companion;
  return `${BASE_PROMPT}\n\n[DYNAMIC INSTRUCTION]\n${modifier}`;
}
```

### 4.3 思维链 (CoT) 透明化
人格切换的逻辑必须在思维链中显性化，以便验证系统决策的合理性。
*   **Prompt 要求**：在 `Thinking` 阶段必须包含 `[Mode Decision]` 区块。
*   **输出示例**：
    > "User Trend (Last 5): Worsening (PHQ9: 12->18). Real-time Emotion: Anxiety (High).
    > Decision: Switch to **Guardian Mode**. 
    > Reason: User is in regression state, avoid challenging questions."

## 5. 演进路线图 (Re-aligned Roadmap)

基于您敏锐的洞察，我们拥有 Groq 实时分析能力，因此可以直接跳过低级的规则引擎阶段，实现 **“会话内实时切换” (Intra-session Switching)**。

### Phase 1: 实时语义驱动 (Real-time Driver) - ✅ Implemented
*   **利用现有架构**：我们的 `Groq Analysis` 已经在每一轮对话中运行，并输出了 `safety`, `emotion`, `intent`, `adaptiveMode`。
*   **实施动作**：
    1.  在 `Groq` 返回结果后，不仅决定 `route` (support/crisis)，还计算出 `target_mode`。
    2.  将 `target_mode` 传入 `streamSupportReply`。
    3.  即时注入对应的 Prompt Modifier。

### Phase 2: 长短记忆深度融合 (Long-term Context Fusion) - ✅ Implemented
*   **Use Case**: 用户说“我不喜欢太学术的词”。
*   **Mechanism**: 
  1. Memory Extractor 捕捉 `communication_style` (Communication Preference)。
  2. 聊天时并行检索 `topic="communication_style"` 的 Memory。
  3. Persona Manager 将其作为 **Hard Constraints** 注入 System Prompt (`[USER PREFERENCES & CONSTRAINTS]`)。
*   **Benefit**: 系统不仅懂“当下情绪”，还懂“用户好恶”，避免踩雷。

### Phase 3: 效果闭环 (Feedback Loop) - ✅ Data-Ready
*   **目标**：验证哪种模式对哪个用户有效。
*   **Mechanism**:
    1.  **Persistence**: 每次 AI 回复时，将 `adaptiveMode` 存入 `Message.meta`。
    2.  **Feedback**: 用户点踩时，自动创建 `OptimizationEvent`，其中包含 `details.adaptiveMode`。
    3.  **Analysis**: 管理后台可直接统计 "Guardian Mode" 的负反馈率。
*   **Result**: 闭环数据链路已打通。
