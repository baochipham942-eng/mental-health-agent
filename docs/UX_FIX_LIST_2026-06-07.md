# Mental 项目 UX 走查修复清单（2026-06-07）

> 来源：Claude app 会话「Mental project core features UX review」(`0b8dd82c`)，从用户视角走查 **会话 / 多模探讨 / 记忆** 三大功能。
> 本清单已对照**当前代码**逐条核验状态（评审后已有一轮修复落地），分为 ✅已修 / 🔶部分 / ⚠️待修 / ❓需运行时复验。
> 测试口径提醒：评审时 token 上限报错是本地 `.env.local` 用 openrouter 免费额度(3655)所致，非生产缺陷；但"上游错误裸透"是真问题（见 #1）。

## 优先处理顺序（仅列待修/部分）

1. **P3** 低对比浅灰文案 → 🔶（已修用户可点击入口，内部/后台弱层级文案未全量改）

---

## 一、会话（聊天）

### #1 · P1 · ✅ 已修 · 错误兜底仍透传原始上游错误
- **现状**：`components/chat/ChatShell.tsx` 已新增 `friendlyChatError()`，限流/超时/内容安全/网络/未知错误均映射成用户可读文案；原始错误只保留在 metadata/log 中，不进气泡正文。
- **验证**：typecheck ✅。

### #2 · P1 · ✅ 已修 · 报错后用户消息成"孤儿"
- **现状**：`ChatShell.tsx:855` 已实现「消息已恢复到输入框，可以点击重试」，孤儿态消除。
- **动作**：无需改；建议补一条失败态的视觉标记（红点/重试按钮）做收尾即可。

### #3 · P2 · ✅ 已修 · 模型署名事实性错误 "DeepSeek R3"
- **现状**：`store/chatStore.ts:24` 已改为 `DeepSeek V3`，测试 mock 已同步。
- **验证**：typecheck ✅ / ChatInput 单测 ✅。

### #4 · P2 · ✅ 已修 · 入口流程断点
- **现象**：心情引导页"开始倾诉"点完落到 dashboard，需再点"开始新对话"才进聊天，情绪铺垫后断连贯。
- **现状**：onboarding 完成后直达 `/c/new`，劳拉已用 in-app browser 走完整流程验证。

### #5 · P2 · 🚫 当前代码不成立 · 转场安慰页文案对比度极低 + 疑似插画缺失
- **现象**：「扛着这些走到这里，你已经很了不起了」浅灰几乎不可读；上方渐变卡 `ob-image-card` 疑似空（插画缺失）。
- **复核**：DevTools computed style 显示正文为 `#374151`，卡片渐变正常；评审截图里的“空卡/低对比”是转场动画中间态误判。

### #6 · P2 · ✅ 已修并验证 · 聊天头像始终空渐变圆
- **现象**：随机分配 persona 既无头像也无名字，用户不知在跟"谁"聊。
- **现状**：主聊天顶部读取当前聊天风格，展示头像和名字（如“小温陪你聊一会儿”）；首次新对话无偏好时仍随机分配，不弹选择器。
- **验证**：登录态 `/c/new` 200；`ChatShell.therapist.test.tsx` 覆盖有偏好展示和无偏好随机分配。

---

## 二、多模探讨（圆桌论道）

### #8 · P1 · ✅ 已修 · Tab 点击热区与可见文字错位
- **现状**：`components/lab/LabContent.tsx` 已去掉 `tabWidth=130` 写死，改为真实 DOM 测量，热区与可见区一致。
- **验证**：typecheck ✅ / in-app browser desktop+mobile 复验 ✅。

### #9 · P2 · ✅ 已修并验证 · 轮次计数跳变（第1轮 → 直接第3轮）
- **现象**：点"总结观点"后计数从 1 跳到 3 再出总结，用户不懂"总结观点"做了什么。
- **现状**：总结按钮走 `intent: summarize`，只基于已有导师发言生成 moderator/synthesis，不触发新导师轮、不发 `round_end`、不推进轮次；普通讨论轮次只按导师回复计数。
- **验证**：登录态 `/dashboard/lab` 200；`GroupChatWindow.test.tsx` 覆盖按钮 intent，`group.test.ts` + `orchestrator.test.ts` 覆盖接口和编排。

---

## 三、记忆（我的记忆）

### #10 · P1 · ✅ 已修 · 内部标签泄露
- **现状**：`components/memory/MemoryPageContent.tsx:64` 已 `text.replace(/^(\s*\[[^\]]*\]\s*)+/, '')` 剥除 `[实验室洞察:trigger_topic]` 类前缀。
- **动作**：无需改；建议补单测覆盖多前缀连写场景。

### #11 · P1 · ✅ 已修（手法偏粗）· 临床第三人称口吻
- **现状**：双重保险——`lab-extractor.ts:26` 提取 prompt 已要求第二人称"你"；`MemoryPageContent.tsx:66` 展示层兜底 `text.replace(/用户/g,'你')`。
- **遗留风险**：`/用户/g` 全局替换过粗，会误伤正文里合法的"用户"二字，且只换代词、不改句式（DB 旧数据仍是案例笔记句式）。
- **建议**：展示层正则收窄为句首/主语位；旧数据考虑重提取或迁移脚本清洗。

### #12 · P1 · ✅ 已修 · 编辑/删除仅 hover 显示（移动端不可用）
- **现状**：`MemoryPageContent.tsx:266` 已 `opacity-100 md:opacity-0 md:group-hover:opacity-100`——移动端常驻、桌面 hover 出现。
- **动作**：无需改。

### #13 · P2 · ✅ 已修 · 默认落在空 Tab
- **现状**：`MemoryPageContent.tsx:142-144` 已加 auto-select：当前 tab 无记忆时自动跳到 `TAB_ORDER` 中首个有记忆的 tab。
- **动作**：无需改。

### #14 · P2 · 🚫 当前代码不成立 · 高亮指示器错位/滞后
- **现象**：切 tab 后内容已变、state 已对，但高亮 pill 仍停在旧位，hover/再渲染才追上。
- **复核**：记忆页当前改用每按钮背景高亮，无独立 pill，不存在“pill 滞后”这个运行时结构；多模 tab 的 pill 已随 #8 修复。

### #15 · P2 · ✅ 已修 · 记忆冗余
- **现象**：一场短圆桌生成 6 条却反复说同 2-3 个点，同一内部 key 跨多分类重复。
- **现状**：`memory-candidate-service.ts` 在保存候选前做同 kind 近似去重，保留更丰富/更高置信版本；单轮最多 5 条、单 kind 最多 2 条，避免短聊刷屏。
- **验证**：`memory-lifecycle.test.ts` 新增去重与限量用例 ✅。

### #16 · P2 · ✅ 已修（架构）· 聊天对话不产出任何记忆
- **现象**：评审时聊天里说的具体事实（PM/车企/35岁/失眠/加班）一条没进，DB `SessionSummaryV2=0`、`MemoryCandidate=0`，6 条全来自圆桌。
- **现状**：已修复流外微任务竞态、topic 越界导致整批丢弃、serverless `after()` 持久性、短聊离开摘要触发；主 extractor 与 lab extractor 失败均有结构化日志。
- **验证**：DeepSeek 重现 candidate 正常生成 / route helper 摘要门槛测试 ✅。

---

## 四、跨功能通用

### P3 · 🔶 部分修复 · 低对比浅灰文案系统性出现
- **现象**：多页"返回首页/返回登录"、"跳过，直接开始"等浅灰几乎不可见，无障碍/可读性问题。
- **现状**：已提升用户可点击入口对比度：onboarding「跳过，直接开始」、登录页「切换账号 / 还没有账号 / 返回登录」、dashboard「返回首页」。
- **边界**：后台工具页、说明性弱层级灰字未全量改，避免把内部信息层级一起重排。

---

## 已验证「不是 bug」（避免误报）
- ❌ ~~Enter 不发送~~ → 工具假象，`ChatInput.tsx:186-190` Enter 发送/Shift+Enter 换行/IME 拦截逻辑完备。
- ❌ ~~记忆"强度 100%"与置信度不符~~ → 非 bug，记忆强度（遗忘曲线）≠ 提取置信度，tooltip 已说明。
- 移动端布局：in-app browser 未真正切移动视口，未臆断（但 #12 已从代码确认并已修）。

---

## 状态总览

| 状态 | 条目 |
|------|------|
| ✅ 已修 | #1, #2, #3, #4, #6, #8, #9, #10, #11(粗), #12, #13, #15, #16 |
| 🔶 部分修复 | P3 |
| 🚫 当前代码不成立 | #5, #14 |
| ❓ 需登录态复验 | 无 |

> 注：#1/#3/#8/#16 已在 2026-06-07 本会话修复，详见下表。

## 本轮修复记录（2026-06-07）

| # | 文件 | 改动 | 验证 |
|---|------|------|------|
| #3 | `store/chatStore.ts:24` + 两个 ChatInput 测试 mock | `DeepSeek R3` → `DeepSeek V3`（deepseek-chat 即 V3） | typecheck ✅ / ChatInput 28 单测 ✅ |
| #8 | `components/lab/LabContent.tsx` | 删 `tabWidth=130` 写死，按钮宽度随内容自适应 + `ref` 测量 `offsetLeft/offsetWidth` 定位高亮 pill（含 resize 监听），热区=可见区 | typecheck ✅ / in-app browser 截图复验 **desktop+mobile 均通过**：点可见文字一击切中，pill 精确跟随 ✅ |
| #1 | `components/chat/ChatShell.tsx` | 新增 `friendlyChatError()` 错误分类映射（额度/超时/内容审查/网络/兜底）；3 处错误分支只显示友好文案，原始错误仅留 `metadata.originalError`，不进气泡 | typecheck ✅ |
| #16 | `app/api/chat/route.ts` + `lib/ai/schemas.ts` | **双根因**：(a) 竞态——抽取触发原在 stream 外微任务里执行，那时 execute 未跑、sessionId/userId 仍 undefined → 触发被早退，聊天记忆永不生成。改为移进 execute 内、handler 完成后触发。(b) 容错——一条 topic 越界就让整批 Zod 校验失败、记忆全丢；给 topic 加 `.catch('personal_context')` 兜底。 | typecheck ✅ / DeepSeek 重现：修前 candidate=0，修后单轮抽出 **3 条**（identity/trigger/coping），总数 7→10，无 ZodError ✅ |
| #9 | `app/api/chat/group/route.ts` + `lib/ai/group/orchestrator.ts` + `hooks/useGroupChat.ts` + `components/lab/__tests__/GroupChatWindow.test.tsx` | 新增 `intent: summarize`；总结只生成 moderator/synthesis/phase_metrics/done，不触发导师新轮次、不推进 `round_end`；UI 快捷按钮带 summarize intent | group/orchestrator 专项测试 ✅ / GroupChatWindow 组件测试 ✅ / 登录态 `/dashboard/lab` 200 ✅ |
| #6 | `components/chat/ChatShell.tsx` + `components/chat/__tests__/ChatShell.therapist.test.tsx` | 主聊天头部展示当前聊天风格头像和名字；首次新对话无偏好时随机分配，不弹选择器 | ChatShell 组件测试 ✅ / 登录态 `/c/new` 200 ✅ |
| #16-B | `lib/memory/summarizer.ts` + `lib/actions/summary.ts` + `app/api/chat/route-helpers.ts` + `components/chat/ChatShell.tsx` | 长聊按 20 个有效用户回合滚动摘要；结束会话时 2 个有效用户回合以上生成轻量摘要；主聊天离开弹窗接上 `completeSession` + `generateSummaryForSession` | route-helper 测试 ✅ / typecheck ✅ |
| #15 | `lib/memory/memory-candidate-service.ts` | 保存候选前按同 kind 近似去重，保留更丰富版本；单轮最多 5 条、单 kind 最多 2 条 | memory lifecycle 测试 ✅ |
| P3 | `styles/onboarding.css` + `app/login/page.tsx` + `components/layout/DashboardBackLink.tsx` | 提升用户可点击次级入口对比度 | typecheck ✅ |
| 登录态页面 | `components/auth/AuthSync.tsx` + `app/(chat)/layout.tsx` + `app/dashboard/layout.tsx` | `AuthSync` 不再在 SessionProvider 外调用 `useSession()`，改由布局传入 session user，修复登录后 `/c/new` 500 | 登录态 `/c/new` 200 ✅ / 登录态 `/dashboard/lab` 200 ✅ / typecheck ✅ |

---

## #16 诊断纪要（根因推翻过程，留作错题本）

1. 初判"openrouter 额度假象 + 20 轮 summary 门槛"——**被 DB 证据推翻**。
2. 查 `MemoryExtractionLog`：3 月中后零新增，但发现**当前代码根本不再写这张表**（只有 read/update，无 create），所以"无日志"不能判定没跑。
3. 切 DeepSeek 重现：聊 2 轮仍 candidate=0、`memory-v2-candidates-extracted` 日志为空 → 排除额度因素，确认**抽取压根没触发**。
4. 读 `route.ts`：`finalSessionId/finalUserId` 在 `createUIMessageStream` 的 execute 回调内（惰性）赋值，而 `Promise.resolve().then()` 微任务先于 execute 执行 → ID 为 undefined → `triggerAsyncMemoryExtraction` 早退。**真根因 = 竞态**。
5. 修竞态后再现：抽取触发了，但暴露 **ZodError**（topic 越界）→ 整批被弃。加 `.catch` 兜底后，candidate 正常生成。

**通用教训**：fire-and-forget 若依赖"流式回调内才赋值的变量"，绝不能放在流外的微任务里读——要么移进回调内、要么用 `await` 后的值。结构化输出的 schema 对单条越界应做 per-field 兜底，不要让一条脏数据连累整批。

## #16 serverless durability（本轮已补修，对称处理两处）

- ✅ **已修**：`route-helpers.ts` 新增 `runAfterResponse()`，把 `triggerAsyncMemoryExtraction`（记忆抽取）和 `scheduleConversationSummaryRefresh`（会话摘要）从裸 `Promise.resolve().then()` 改为 `after()`(next/server)。serverless 下运行时会等任务跑完再回收实例，避免抽取/摘要半路被冻结掐断。带 try/catch 兜底：拿不到 request scope 时回退原 fire-and-forget，绝不影响聊天主链路。
- **验证**：DeepSeek 重现一轮，`after()` 路径下 `memory-extraction-done` 触发、candidate 正常生成 3 条（本地长驻 Node）。serverless 冻结场景本地无法复现，但接线正确 + fallback 保证不回归。

## #16 后续建议

- **MemoryExtractionLog 表仍未恢复写入**：当前改用结构化日志暴露失败，已经能区分“真无记忆”和“LLM/schema 失败”；如果后续要在后台页面追踪失败率，可再恢复 `MemoryExtractionLog` 写入。
- **短聊摘要已补**：`SessionSummaryV2` 不再只依赖 20 轮滚动门槛，结束会话时 2 个有效用户回合以上会触发轻量摘要。
