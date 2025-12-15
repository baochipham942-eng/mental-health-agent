# 前端修复总结

## 修复内容

### A. awaiting_followup 的 followupAnswer 累计 ✅

**问题**：在 `awaiting_followup` 阶段，系统会反复问同一问题，因为前端只发送最后一句用户输入，没有累计之前的回答。

**修复方案**：
1. 在 `store/chatStore.ts` 中添加 `followupAnswerDraft: string` 字段（仅前端内部使用，不持久化）
2. 添加 `appendFollowupAnswer()` 和 `clearFollowupAnswer()` 方法
3. 在 `ChatShell.tsx` 的 `handleSend` 中：
   - 如果 `currentState === 'awaiting_followup'`：累计用户输入到 `followupAnswerDraft`，使用累计值发送请求
   - 如果 `currentState !== 'awaiting_followup'`：清空 `followupAnswerDraft`，设置新的 `initialMessage`
4. 当状态切回 `normal` 或进入 `conclusion` 时：清空 `followupAnswerDraft`
5. 当从 `normal` 切换到 `awaiting_followup` 时：确保 `followupAnswerDraft` 为空（首次进入）

**预期效果**：用户先答"没有"，再答"2"，系统不会忘记"没有"，也就不会把"自伤"问题反复问回来。

**修改文件**：
- `store/chatStore.ts`
- `components/chat/ChatShell.tsx`

### B. 隐藏情绪标签，只显示在 Debug 面板 ✅

**问题**：情绪标签/分数（如"抑郁 9/10"）对用户展示，影响用户体验。

**修复方案**：
1. 在 `MessageBubble.tsx` 中移除 `EmotionIndicator` 的渲染
2. 在 `ChatShell.tsx` 中收集所有 assistant 消息的情绪信息
3. 在 `DebugDrawer.tsx` 中添加情绪信息显示：
   - 仅当 Debug 面板打开时显示
   - 标注为"调试信息（仅开发可见）"
   - 显示格式：`{label} {score}/10`

**预期效果**：用户不再看到情绪标签，但开发者可以在 Debug 面板中查看。

**修改文件**：
- `components/chat/MessageBubble.tsx`
- `components/chat/ChatShell.tsx`
- `components/chat/DebugDrawer.tsx`

### C. Web 端布局优化 ✅

**问题**：消息流宽度/对齐不够自然，右侧空旷，气泡可能撑满整行。

**修复方案**：
1. `ChatShell.tsx`：
   - 外层容器改为 `w-full max-w-3xl mx-auto px-4`（居中，最大宽度 3xl，左右 padding）
2. `MessageBubble.tsx`：
   - 用户气泡：`max-w-[80%]`（桌面和移动端）
   - assistant 气泡：`max-w-[85%]`（移动端）+ `max-w-[80%]`（桌面端）
3. `app/globals.css`：
   - 添加桌面端和移动端的代码块/列表优化
   - 确保不撑破布局

**预期效果**：消息流居中显示，气泡宽度合理，避免右侧空旷和"医院式大白板"。

**修改文件**：
- `components/chat/ChatShell.tsx`
- `components/chat/MessageBubble.tsx`
- `app/globals.css`

## 自测清单

### 1. awaiting_followup 累计验证
- [ ] 触发 assessment intake → 系统问 1-2 个问题
- [ ] 先回"没有"，再回"2"：不应重复出现同一条"自伤想法"追问
- [ ] 检查 Network 请求，确认 `message` 字段包含累计的回答

### 2. 情绪标签隐藏验证
- [ ] 完成一次对话，观察页面：不应显示"抑郁 9/10"等情绪标签
- [ ] 打开 Debug 面板：应显示情绪分析信息

### 3. 布局优化验证
- [ ] 桌面端：消息流居中，最大宽度 3xl，气泡宽度合理
- [ ] 移动端：气泡宽度适配，不撑破布局
- [ ] 超长消息/代码块：不撑破布局

### 4. Support 路由验证
- [ ] 输入"我只想倾诉，不要建议也不要分析"：页面不再展示评估追问卡片（至少不会继续重复追问）

## 修改文件列表

1. `store/chatStore.ts` - 添加 followupAnswerDraft 累计逻辑
2. `components/chat/ChatShell.tsx` - 实现累计逻辑，收集情绪信息
3. `components/chat/MessageBubble.tsx` - 移除情绪标签，优化气泡宽度
4. `components/chat/DebugDrawer.tsx` - 添加情绪信息显示
5. `app/globals.css` - 优化代码块/列表样式

---

**修复日期**：2025-01-XX  
**状态**：✅ 已完成
