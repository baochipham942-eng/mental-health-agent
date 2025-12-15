# 心理疗愈产品 MVP - 前端实现文档

## 📋 文档索引

- [PRD 需求文档](./frontend-mvp-chat.md) - 完整的产品需求文档
- [实现总结](./IMPLEMENTATION_SUMMARY.md) - 技术实现总结
- [本地验证步骤](./LOCAL_VERIFICATION.md) - 详细的验证步骤（含最终验收 Checklist）
- [验收报告](./ACCEPTANCE_REPORT.md) - 最终验收报告
- [最终总结](./FINAL_SUMMARY.md) - 验收与补强总结

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 启动开发服务器
```bash
npm run dev
```

### 3. 打开浏览器
访问 `http://localhost:3000`

## ✅ 已完成功能

### 核心功能
- ✅ 单页面 Chat 界面
- ✅ 消息流（用户/助手气泡）
- ✅ 输入框（Enter 发送、Shift+Enter 换行）
- ✅ 移动端适配（safe-area + sticky）

### 结构化渲染
- ✅ 初筛总结（Summary）
- ✅ 风险与分流（Risk & Triage）
- ✅ 下一步行动清单（NextStepsChecklist，可勾选，localStorage 持久化）
- ✅ 行动卡片（ActionCardGrid，2张，可展开/练习）

### 分阶段体验
- ✅ Intake 阶段（蓝色背景，突出显示评估问题）
- ✅ Gap Followup 阶段（橙色背景，突出显示澄清问题）
- ✅ Conclusion 阶段（结构化区块渲染）

### 路由处理
- ✅ Assessment 路由（评估路径）
- ✅ Support 路由（支持路径，共情倾听）
- ✅ Crisis 路由（红色 Banner + 强提醒 + 求助建议）

### 降级策略
- ✅ Zod 校验失败时降级为纯文本渲染
- ✅ 不白屏，正常显示 markdown 内容
- ✅ Debug 面板显示验证错误

### Debug 面板
- ✅ 可折叠，默认隐藏
- ✅ 显示 debugPrompts（如果 DEBUG_PROMPTS=1）
- ✅ 显示 validationError（如果校验失败）

## 📁 文件结构

```
心理疗愈agent/
├── docs/prd/
│   ├── README.md                    # 本文件
│   ├── frontend-mvp-chat.md         # PRD 需求文档
│   ├── IMPLEMENTATION_SUMMARY.md    # 实现总结
│   └── LOCAL_VERIFICATION.md        # 验证步骤
├── app/
│   ├── page.tsx                     # 主页面
│   └── globals.css                  # 全局样式（含 safe-area 支持）
├── components/chat/
│   ├── ChatShell.tsx                # 主容器
│   ├── MessageList.tsx              # 消息列表
│   ├── MessageBubble.tsx            # 消息气泡（支持结构化渲染）
│   ├── ChatInput.tsx                # 输入框
│   ├── ConclusionSections.tsx       # 结论区块容器
│   ├── NextStepsChecklist.tsx       # 下一步清单
│   ├── ActionCardGrid.tsx           # 行动卡片网格
│   ├── ActionCardItem.tsx           # 行动卡片项
│   └── DebugDrawer.tsx              # Debug 面板
├── lib/api/
│   └── chat.ts                      # API client（含 zod 校验）
├── store/
│   └── chatStore.ts                 # 状态管理（zustand + persist）
└── package.json                     # 依赖（已添加 zod、react-markdown、zustand）
```

## 🔧 技术栈

- **框架**: Next.js 14 (App Router) + TypeScript
- **样式**: TailwindCSS
- **状态管理**: Zustand + persist 中间件
- **Markdown 渲染**: react-markdown
- **Schema 校验**: zod

## 📝 关键实现点

### 1. API Client (`lib/api/chat.ts`)
- 严格对齐后端字段（基于 `app/api/chat/route.ts` 和 `types/chat.ts`）
- 使用 zod 进行响应校验
- 仅在 conclusion 阶段校验结构化字段
- 校验失败时返回降级响应（包含 validationError）

### 2. 状态管理 (`store/chatStore.ts`)
- 使用 zustand 管理会话状态
- localStorage 持久化（messages、state、routeType、assessmentStage、initialMessage）
- 确保多轮对话状态正确传递

### 3. 结构化渲染 (`components/chat/ConclusionSections.tsx`)
- 从 reply 文本中提取【初筛总结】、【风险与分流】、【下一步清单】
- 渲染 actionCards 数组
- 支持 crisis 路由的红色 Banner
- 校验失败时降级为纯文本渲染

### 4. 降级策略
- 如果 zod 校验失败，隐藏结构化区块
- 使用 react-markdown 渲染纯文本
- Debug 面板显示验证错误详情

## 🧪 验证步骤

详细的验证步骤请参考 [LOCAL_VERIFICATION.md](./LOCAL_VERIFICATION.md)

### 快速验证清单
- [ ] 评估路径：intake → gap_followup → conclusion
- [ ] Crisis 路由：红色 Banner + 求助建议
- [ ] 行动卡片：展开/练习功能
- [ ] 下一步清单：勾选 + 持久化
- [ ] 降级策略：校验失败不白屏
- [ ] Debug 面板：显示 debugPrompts 和 validationError
- [ ] 移动端：键盘不遮挡输入框

## 🐛 常见问题

### 问题 1：zustand persist 报错
**解决方案**：确保安装了最新版本 `npm install zustand@latest`

### 问题 2：结构化区块不显示
**检查点**：
- 后端是否返回 `assessmentStage: 'conclusion'`
- `actionCards` 是否通过 zod 校验
- 检查 Debug 面板是否有 `validationError`

### 问题 3：移动端输入框被键盘遮挡
**检查点**：
- 是否使用了 `pb-safe` 类
- 是否设置了 `sticky bottom-0`

## 📚 相关文档

- [后端 API 文档](../architecture/current-architecture.md)
- [Skill 系统文档](../skills/MAINTENANCE.md)
- [CI/Contract 测试文档](../ci.md)

---

**最后更新**: 2025-01-XX  
**状态**: ✅ 已完成，待验证
