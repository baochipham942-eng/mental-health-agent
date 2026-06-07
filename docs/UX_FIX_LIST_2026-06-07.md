# Mental 项目 UX 走查修复清单（2026-06-07）

> 来源：Claude app 会话「Mental project core features UX review」(`0b8dd82c`)，从用户视角走查 **会话 / 多模探讨 / 记忆** 三大功能。
> 本清单已对照**当前代码**逐条核验状态（评审后已有一轮修复落地），分为 ✅已修 / 🔶部分 / ⚠️待修 / ❓需运行时复验。
> 测试口径提醒：评审时 token 上限报错是本地 `.env.local` 用 openrouter 免费额度(3655)所致，非生产缺陷；但"上游错误裸透"是真问题（见 #1）。

## 优先处理顺序（仅列待修/部分）

1. **#1** 错误兜底仍透传原始上游错误 → 🔶
2. **#8** 多模 Tab 热区错位，点不中 → ⚠️
3. **#3** 模型署名 "DeepSeek R3"（不存在该型号）→ ⚠️
4. **#16** 聊天对话不产出记忆 → ⚠️（架构）
5. **#14** 记忆高亮 pill 滞后 → ⚠️
6. **#15** 记忆冗余 → ⚠️（质量）

---

## 一、会话（聊天）

### #1 · P1 · 🔶 部分修复 · 错误兜底仍透传原始上游错误
- **现状**：`components/chat/ChatShell.tsx:~855` 已改为友好包装 + 消息回填输入框 + 可重试，但 content 仍 `发送失败：${finalApiError.error}`，并把 `originalError: finalApiError.error` 原样带出——**原始上游错误（如 OpenRouter 的 token 限额 URL）仍会糊到用户气泡里**。
- **修法**：加一层错误码→文案映射（限流/超时/内容审查/未知），用户侧只显示友好话术，原始 `error` 仅写入日志/`errorCode`，不进 `content`。
- **文件**：`components/chat/ChatShell.tsx:855` 附近（含 882/949 三处错误分支）。

### #2 · P1 · ✅ 已修 · 报错后用户消息成"孤儿"
- **现状**：`ChatShell.tsx:855` 已实现「消息已恢复到输入框，可以点击重试」，孤儿态消除。
- **动作**：无需改；建议补一条失败态的视觉标记（红点/重试按钮）做收尾即可。

### #3 · P2 · ⚠️ 待修 · 模型署名事实性错误 "DeepSeek R3"
- **现状**：`store/chatStore.ts:24` 仍 `deepseek: { label: 'DeepSeek R3', modelName: 'deepseek-chat' }`。DeepSeek 无 R3（仅 V3=`deepseek-chat` / R1=`deepseek-reasoner`）。
- **修法**：label 改 `DeepSeek V3`（或按实际调用模型动态取），署名跟随真实 provider；底部署名 `ChatInput.tsx:448` 兜底默认值同步。
- **文件**：`store/chatStore.ts:24`、`components/chat/ChatInput.tsx:448`。

### #4 · P2 · ❓ 需复验 · 入口流程断点
- **现象**：心情引导页"开始倾诉"点完落到 dashboard，需再点"开始新对话"才进聊天，情绪铺垫后断连贯。
- **复验**：确认 onboarding 完成后的跳转目标，应直达 `/c/new` 而非 `/dashboard`。
- **文件**：onboarding 完成回调 / `app/.../onboarding`（静态 grep 未定位，需运行时确认）。

### #5 · P2 · ❓ 需复验 · 转场安慰页文案对比度极低 + 疑似插画缺失
- **现象**：「扛着这些走到这里，你已经很了不起了」浅灰几乎不可读；上方渐变卡 `ob-image-card` 疑似空（插画缺失）。
- **文件**：搜 `ob-image-card`。

### #6 · P2 · ❓ 需复验 · 聊天头像始终空渐变圆
- **现象**：随机分配 persona 既无头像也无名字，用户不知在跟"谁"聊。
- **修法**：persona 绑定头像 + 名字并在头部展示。

---

## 二、多模探讨（圆桌论道）

### #8 · P1 · ⚠️ 待修 · Tab 点击热区与可见文字错位
- **现状**：`components/lab/LabContent.tsx:22` 仍 `const tabWidth = 130;` 写死，emoji+文字（🎭圆桌论道）实际宽度超出固定热区，**点可见文字点不中**。
- **修法**：去掉写死宽度，改用真实测量（`ref` + `getBoundingClientRect` / `flex-1` 等宽 / CSS 自适应），让热区=可见区。
- **文件**：`components/lab/LabContent.tsx:22,24,40,53`（同时连带修 #14 的 pillLeft）。

### #9 · P2 · ❓ 需复验 · 轮次计数跳变（第1轮 → 直接第3轮）
- **现象**：点"总结观点"后计数从 1 跳到 3 再出总结，用户不懂"总结观点"做了什么。
- **修法**：要么总结不计轮次，要么显式提示"正在汇总前 N 轮"。

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

### #14 · P2 · ⚠️ 待修 · 高亮指示器错位/滞后
- **现象**：切 tab 后内容已变、state 已对，但高亮 pill 仍停在旧位，hover/再渲染才追上。
- **根因**：与 #8 同源——固定宽 `pillLeft` + flex-wrap，宽度假设与真实渲染不符。
- **修法**：同 #8，pill 位置/宽度改为基于真实 DOM 测量。
- **文件**：`components/lab/LabContent.tsx`（pillLeft）/ `MemoryPageContent.tsx` 对应指示器。

### #15 · P2 · ⚠️ 待修 · 记忆冗余
- **现象**：一场短圆桌生成 6 条却反复说同 2-3 个点，同一内部 key 跨多分类重复。
- **修法**：提取后做去重/合并（按语义相似度或同 key 收敛），或限制单场最大条数。
- **文件**：`lib/memory/lab-extractor.ts` 提取后处理 / `memory-candidate-service.ts`。

### #16 · P2 · ⚠️ 待修（架构）· 聊天对话不产出任何记忆
- **现象**：评审时聊天里说的具体事实（PM/车企/35岁/失眠/加班）一条没进，DB `SessionSummaryV2=0`、`MemoryCandidate=0`，6 条全来自圆桌。
- **疑因**：聊天记忆疑似要等"离开会话/定时任务"才提取，中途导航走未触发。
- **修法**：确认 `session-summary-v2-writer` 触发时机，补 `beforeunload`/路由离开/空闲定时任一可靠触发点。
- **文件**：`lib/memory/session-summary-v2-writer.ts` + 其调用方。

---

## 四、跨功能通用

### P3 · ⚠️ 待修 · 低对比浅灰文案系统性出现
- **现象**：多页"返回首页/返回登录"、"跳过，直接开始"等浅灰几乎不可见，无障碍/可读性问题。
- **修法**：统一提升次要文案对比度到 WCAG AA。

---

## 已验证「不是 bug」（避免误报）
- ❌ ~~Enter 不发送~~ → 工具假象，`ChatInput.tsx:186-190` Enter 发送/Shift+Enter 换行/IME 拦截逻辑完备。
- ❌ ~~记忆"强度 100%"与置信度不符~~ → 非 bug，记忆强度（遗忘曲线）≠ 提取置信度，tooltip 已说明。
- 移动端布局：in-app browser 未真正切移动视口，未臆断（但 #12 已从代码确认并已修）。

---

## 状态总览

| 状态 | 条目 |
|------|------|
| ✅ 已修 | #1, #2, #3, #8, #10, #11(粗), #12, #13, #16 |
| ⚠️ 待修 | #15, P3 |
| 🚫 当前代码不成立 | #14（记忆页改用每按钮 bg 高亮，无独立 pill，不会滞后） |
| ❓ 需运行时复验 | #4, #5, #6, #9 |

> 注：#1/#3/#8/#16 已在 2026-06-07 本会话修复，详见下表。

## 本轮修复记录（2026-06-07）

| # | 文件 | 改动 | 验证 |
|---|------|------|------|
| #3 | `store/chatStore.ts:24` + 两个 ChatInput 测试 mock | `DeepSeek R3` → `DeepSeek V3`（deepseek-chat 即 V3） | typecheck ✅ / ChatInput 28 单测 ✅ |
| #8 | `components/lab/LabContent.tsx` | 删 `tabWidth=130` 写死，按钮宽度随内容自适应 + `ref` 测量 `offsetLeft/offsetWidth` 定位高亮 pill（含 resize 监听），热区=可见区 | typecheck ✅ / in-app browser 截图复验 **desktop+mobile 均通过**：点可见文字一击切中，pill 精确跟随 ✅ |
| #1 | `components/chat/ChatShell.tsx` | 新增 `friendlyChatError()` 错误分类映射（额度/超时/内容审查/网络/兜底）；3 处错误分支只显示友好文案，原始错误仅留 `metadata.originalError`，不进气泡 | typecheck ✅ |
| #16 | `app/api/chat/route.ts` + `lib/ai/schemas.ts` | **双根因**：(a) 竞态——抽取触发原在 stream 外微任务里执行，那时 execute 未跑、sessionId/userId 仍 undefined → 触发被早退，聊天记忆永不生成。改为移进 execute 内、handler 完成后触发。(b) 容错——一条 topic 越界就让整批 Zod 校验失败、记忆全丢；给 topic 加 `.catch('personal_context')` 兜底。 | typecheck ✅ / DeepSeek 重现：修前 candidate=0，修后单轮抽出 **3 条**（identity/trigger/coping），总数 7→10，无 ZodError ✅ |

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

## #16 仍遗留（建议后续，本轮未动）

- **抽取失败零可观测性**：`extractor.ts:63` 仍 `catch → return []`，且 `extractAndSave` 不写 `MemoryExtractionLog`（当前代码该表只读不写）。线上限流/超时时无人知晓。建议把失败写 warn 日志或恢复 MemoryExtractionLog 写入。
- **SessionSummaryV2 的 20 轮门槛**（`summarizer.ts:49`）未动——这是产品决策，日常短聊不会生成会话级摘要，需你拍板是否下调。
