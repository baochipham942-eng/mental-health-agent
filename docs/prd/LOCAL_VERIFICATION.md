# 本地验证步骤

## 一、环境准备

### 1.1 安装依赖
```bash
npm install
```

### 1.2 启动开发服务器
```bash
npm run dev
```

### 1.3 打开浏览器
访问 `http://localhost:3000`

## 二、评估路径验证（assessment）

### 2.1 Intake 阶段

**步骤**：
1. 在输入框中输入："最近工作压力很大，经常失眠"
2. 点击"发送"按钮或按 Enter

**预期结果**：
- ✅ 系统返回 1-2 个评估问题
- ✅ 问题显示在蓝色背景的区块中（intake 阶段样式）
- ✅ 显示引导语："为了更好地了解你的情况，请回答以下问题："
- ✅ 问题以有序列表形式显示

**验证点**：
- 检查 Network 标签，确认请求包含 `routeType: 'assessment'`、`assessmentStage: 'intake'`
- 检查响应包含 `assistantQuestions` 数组

### 2.2 Gap Followup 阶段（可选）

**步骤**：
1. 回答评估问题，例如："持续了2周，影响睡眠和工作，评分8分"
2. 点击"发送"按钮

**预期结果**：
- ✅ 如有信息缺口，系统追问 1-2 个澄清问题
- ✅ 澄清问题显示在橙色背景的区块中（gap_followup 阶段样式）
- ✅ 显示"我需要你补充："提示

**验证点**：
- 检查 Network 标签，确认请求包含 `state: 'awaiting_followup'`、`assessmentStage: 'gap_followup'`
- 检查响应包含 `assistantQuestions` 数组

### 2.3 Conclusion 阶段

**步骤**：
1. 补充回答后，系统进入 conclusion 阶段
2. 观察页面显示的结构化区块

**预期结果**：
- ✅ 显示【初筛总结】区块（灰色背景，包含总结文本）
- ✅ 显示【风险与分流】区块（黄色背景，或红色背景如果是 crisis）
- ✅ 显示【下一步行动清单】（2-3条，蓝色背景，可勾选）
- ✅ 显示【行动卡片】（2张，白色卡片，可展开）

**验证点**：
- 检查 Network 标签，确认响应包含 `assessmentStage: 'conclusion'`
- 检查响应包含 `actionCards` 数组（2张卡片）
- 检查 `reply` 文本中包含【下一步清单】标记
- 检查结构化区块是否正确解析和渲染

## 三、行动卡片验证

### 3.1 卡片折叠态

**步骤**：
1. 进入 conclusion 阶段
2. 查看行动卡片

**预期结果**：
- ✅ 显示 2 张行动卡片
- ✅ 每张卡片显示：标题、适用场景（when）、预计时长/次数（effort 标签：低/中/高）、"开始/展开"按钮

### 3.2 卡片展开态

**步骤**：
1. 点击任意卡片的"开始/展开"按钮

**预期结果**：
- ✅ 卡片展开，显示 steps 列表
- ✅ 每步 ≤16 汉字
- ✅ 步骤以有序列表形式显示（带序号）
- ✅ 显示"开始练习"按钮

### 3.3 练习态

**步骤**：
1. 在展开态下，点击"开始练习"按钮

**预期结果**：
- ✅ 以更大字号/分步方式呈现 steps
- ✅ 每步显示在独立的卡片中
- ✅ 显示"返回步骤列表"按钮

**步骤**：
2. 点击"返回步骤列表"按钮

**预期结果**：
- ✅ 返回步骤列表视图

## 四、下一步清单验证

### 4.1 清单显示

**步骤**：
1. 进入 conclusion 阶段
2. 查看下一步行动清单

**预期结果**：
- ✅ 显示 2-3 条清单项
- ✅ 每条清单项前有复选框

### 4.2 勾选功能

**步骤**：
1. 勾选其中一条清单项

**预期结果**：
- ✅ 已勾选项显示删除线或灰色
- ✅ 勾选状态立即生效

### 4.3 持久化验证

**步骤**：
1. 勾选几条清单项
2. 刷新页面（F5 或 Cmd+R）

**预期结果**：
- ✅ 勾选状态已保存（localStorage）
- ✅ 刷新后勾选状态仍然存在

**验证点**：
- 打开浏览器开发者工具 → Application → Local Storage
- 检查 `nextStepsCompleted_${messageId}` 键是否存在
- 确认值包含已勾选的索引数组

## 五、Crisis 路由验证

### 5.1 触发 Crisis 路由

**方法 1：初始消息触发**
- 输入："我想死" 或 "不想活了"

**方法 2：Followup 回答触发**
- 在 intake 阶段，回答风险问题时输入："伤害自己的想法：经常出现"

**步骤**：
1. 输入高风险表达
2. 点击"发送"按钮

**预期结果**：
- ✅ 系统路由为 `crisis`
- ✅ 显示红色 Banner："⚠️ 检测到高风险表达，建议立即寻求专业帮助"
- ✅ 【风险与分流】区块显示红色背景
- ✅ 显示求助建议区块（包含求助热线、资源链接等）

**验证点**：
- 检查 Network 标签，确认响应包含 `routeType: 'crisis'`
- 检查红色 Banner 是否正确显示
- 检查求助资源列表是否正确显示

## 六、支持路径验证（support）

### 6.1 触发 Support 路由

**步骤**：
1. 输入："我只想倾诉，不要建议" 或 "不需要分析，只要倾诉"
2. 点击"发送"按钮

**预期结果**：
- ✅ 系统路由为 `support`
- ✅ 系统提供共情倾听，不显示结构化区块
- ✅ 回复为普通 markdown 文本

**验证点**：
- 检查 Network 标签，确认响应包含 `routeType: 'support'`
- 确认不显示结构化区块（ConclusionSections）

## 七、降级策略验证

### 7.1 模拟校验失败

**方法 1：临时修改 API client（仅用于测试）**

在 `lib/api/chat.ts` 的 `sendChatMessage` 函数中，临时添加：

```typescript
// 临时测试：模拟 actionCards 校验失败
if (data.assessmentStage === 'conclusion' && data.actionCards) {
  // 破坏 actionCards 格式
  data.actionCards = [{ invalid: 'field' }] as any;
}
```

**方法 2：使用浏览器控制台**

在浏览器控制台中执行：

```javascript
// 拦截 fetch 请求
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (args[0].includes('/api/chat')) {
    const cloned = response.clone();
    const data = await cloned.json();
    if (data.assessmentStage === 'conclusion' && data.actionCards) {
      // 破坏 actionCards 格式
      data.actionCards = [{ invalid: 'field' }];
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: response.headers,
      });
    }
  }
  return response;
};
```

**步骤**：
1. 使用上述方法之一模拟校验失败
2. 完成一次对话，进入 conclusion 阶段
3. 观察页面显示

**预期结果**：
- ✅ 隐藏结构化区块（NextStepsChecklist、ActionCardGrid）
- ✅ 将 `reply` 作为纯文本/markdown 渲染（使用 react-markdown）
- ✅ 不出现白屏
- ✅ Debug 面板显示"结构化解析失败原因"

**验证点**：
- 检查页面是否正常显示（不白屏）
- 检查 Debug 面板是否显示 `validationError`
- 检查 `validationError.actionCards` 或 `validationError.nextStepsLines` 是否有错误信息

### 7.2 恢复正常

**步骤**：
1. 移除临时修改
2. 刷新页面
3. 重新测试

**预期结果**：
- ✅ 恢复正常的结构化渲染

## 八、Debug 面板验证

### 8.1 显示 Debug 面板

**前提条件**：
- 确保后端环境变量 `DEBUG_PROMPTS=1`（如果后端支持）

**步骤**：
1. 完成一次对话，进入 conclusion 阶段
2. 查看页面右下角

**预期结果**：
- ✅ 显示"显示 Debug"按钮（如果存在 debugPrompts 或 validationError）

### 8.2 展开 Debug 面板

**步骤**：
1. 点击"显示 Debug"按钮

**预期结果**：
- ✅ Debug 面板展开
- ✅ 显示 `debugPrompts` 信息（如果存在）：
  - System Prompt
  - User Prompt
  - Selected Skills
  - Selection Reason
- ✅ 显示 `validationError` 信息（如果存在）：
  - actionCards 错误
  - nextStepsLines 错误

### 8.3 隐藏 Debug 面板

**步骤**：
1. 点击"隐藏 Debug"按钮

**预期结果**：
- ✅ Debug 面板收起

## 九、移动端验证

### 9.1 响应式布局

**步骤**：
1. 使用浏览器开发者工具切换到移动端视图（或使用真实移动设备）
2. 调整窗口宽度到移动端尺寸（如 375px）

**预期结果**：
- ✅ 消息气泡在小屏幕上正确显示（max-w-[80%]）
- ✅ 行动卡片在移动端单列显示（grid-cols-1）
- ✅ 输入框固定在底部

### 9.2 键盘适配

**步骤**：
1. 在移动端视图中，点击输入框
2. 模拟键盘弹出（iOS Safari 或 Chrome DevTools）

**预期结果**：
- ✅ 输入框固定在底部，键盘弹出不遮挡
- ✅ 使用 `safe-area-inset-bottom` 适配底部安全区域
- ✅ 消息流可以正常滚动

### 9.3 输入交互

**步骤**：
1. 在输入框中输入文本
2. 按 Enter 键

**预期结果**：
- ✅ 消息发送（Enter 发送）

**步骤**：
3. 在输入框中输入文本
4. 按 Shift+Enter 键

**预期结果**：
- ✅ 输入框换行（Shift+Enter 换行）

## 十、状态持久化验证

### 10.1 对话历史持久化

**步骤**：
1. 完成一次多轮对话
2. 刷新页面（F5 或 Cmd+R）

**预期结果**：
- ✅ 对话历史已保存
- ✅ 刷新后对话历史仍然存在

**验证点**：
- 打开浏览器开发者工具 → Application → Local Storage
- 检查 `chat-storage` 键是否存在
- 确认值包含 `messages`、`currentState`、`routeType`、`assessmentStage` 等

### 10.2 状态传递验证

**步骤**：
1. 完成 intake 阶段
2. 查看 Network 标签，记录请求中的 `state` 和 `assessmentStage`
3. 回答评估问题
4. 查看新的请求

**预期结果**：
- ✅ 新请求包含之前返回的 `state` 和 `assessmentStage`
- ✅ 多轮对话状态正确推进

## 十一、错误处理验证

### 11.1 网络错误

**步骤**：
1. 断开网络连接（或使用浏览器开发者工具 → Network → Offline）
2. 尝试发送消息

**预期结果**：
- ✅ 显示错误提示（红色提示框）
- ✅ 错误信息清晰易懂："网络错误"
- ✅ 可以继续输入和发送（错误不影响后续操作）

### 11.2 服务器错误

**步骤**：
1. 临时修改 API 地址为无效地址
2. 尝试发送消息

**预期结果**：
- ✅ 显示错误提示
- ✅ 错误信息包含服务器返回的错误详情

## 十二、性能验证

### 12.1 页面加载

**步骤**：
1. 打开浏览器开发者工具 → Network 标签
2. 刷新页面
3. 记录页面加载时间

**预期结果**：
- ✅ 首次加载 < 2s

### 12.2 消息发送响应

**步骤**：
1. 打开浏览器开发者工具 → Network 标签
2. 发送一条消息
3. 记录响应时间

**预期结果**：
- ✅ 前端处理时间 < 100ms（依赖后端响应时间）

### 12.3 滚动流畅度

**步骤**：
1. 发送多条消息，使消息流变长
2. 滚动消息列表

**预期结果**：
- ✅ 滚动流畅（60fps）
- ✅ 无卡顿现象

## 十三、完整流程验证

### 13.1 完整评估流程

**步骤**：
1. 打开页面
2. 输入初始消息："最近工作压力很大，经常失眠"
3. 回答评估问题："持续了2周，影响睡眠和工作，评分8分"
4. 如有 gap_followup，补充回答
5. 进入 conclusion 阶段
6. 查看结构化区块
7. 勾选下一步清单
8. 展开行动卡片
9. 点击"开始练习"

**预期结果**：
- ✅ 所有阶段正常推进
- ✅ 所有功能正常工作
- ✅ 无错误或异常

### 13.2 Crisis 流程

**步骤**：
1. 打开页面
2. 输入高风险表达："我想死"
3. 查看红色 Banner 和求助建议

**预期结果**：
- ✅ Crisis 路由正确触发
- ✅ 红色 Banner 正确显示
- ✅ 求助建议正确显示

## 十四、常见问题排查

### 问题 1：zustand persist 报错
**症状**：控制台报错 `persist is not a function`
**解决方案**：
- 确保安装了 `zustand` 最新版本：`npm install zustand@latest`
- 检查导入是否正确：`import { persist, createJSONStorage } from 'zustand/middleware'`

### 问题 2：react-markdown 报错
**症状**：控制台报错 `Cannot find module 'react-markdown'`
**解决方案**：
- 安装依赖：`npm install react-markdown`

### 问题 3：结构化区块不显示
**检查点**：
- 后端是否返回了 `assessmentStage: 'conclusion'`
- `actionCards` 是否通过 zod 校验
- `reply` 文本中是否包含【下一步清单】等标记
- 检查 Debug 面板是否有 `validationError`

### 问题 4：移动端输入框被键盘遮挡
**检查点**：
- 是否使用了 `pb-safe` 类
- 是否设置了 `sticky bottom-0`
- 浏览器是否支持 `safe-area-inset-bottom`
- 检查 CSS 是否正确加载

### 问题 5：状态不持久化
**检查点**：
- localStorage 是否被禁用
- 浏览器是否支持 localStorage
- 检查 `chat-storage` 键是否存在

---

## 十五、Frontend MVP 验收 Checklist

### 15.1 评估路径（Assessment）

#### Intake 阶段
- [ ] 输入初始消息后，系统返回 1-2 个评估问题
- [ ] 问题显示在蓝色背景区块中
- [ ] 显示引导语："为了更好地了解你的情况，请回答以下问题："
- [ ] 问题以有序列表形式显示
- [ ] Network 请求包含 `routeType: 'assessment'`、`assessmentStage: 'intake'`

#### Gap Followup 阶段
- [ ] 回答评估问题后，如有缺口，系统追问澄清问题
- [ ] 澄清问题显示在橙色背景区块中
- [ ] 显示"我需要你补充："提示
- [ ] Network 请求包含 `state: 'awaiting_followup'`、`assessmentStage: 'gap_followup'`

#### Conclusion 阶段
- [ ] 补充回答后，系统进入 conclusion 阶段
- [ ] 显示【初筛总结】区块（灰色背景）
- [ ] 显示【风险与分流】区块（黄色背景）
- [ ] 显示【下一步行动清单】（2-3条，蓝色背景，可勾选）
- [ ] 显示【行动卡片】（2张，白色卡片，可展开）
- [ ] Network 响应包含 `assessmentStage: 'conclusion'`、`actionCards` 数组

### 15.2 支持路径（Support）

- [ ] 输入"我只想倾诉，不要建议"后，系统路由为 `support`
- [ ] 系统提供共情倾听，不显示结构化区块
- [ ] 回复为普通 markdown 文本
- [ ] Network 响应包含 `routeType: 'support'`

### 15.3 危机路径（Crisis）

- [ ] 输入高风险表达（如"我想死"）后，系统路由为 `crisis`
- [ ] 显示红色 Banner："⚠️ 检测到高风险表达，建议立即寻求专业帮助"
- [ ] 【风险与分流】区块显示红色背景
- [ ] 显示求助建议区块（包含求助热线、资源链接等）
- [ ] **不显示**行动卡片和下一步清单
- [ ] Network 响应包含 `routeType: 'crisis'`

### 15.4 结构化渲染

#### 行动卡片
- [ ] 卡片折叠态：显示标题、适用场景、预计时长/次数、"开始/展开"按钮
- [ ] 点击"开始/展开"后，展开显示 steps 列表（每步 ≤16 汉字）
- [ ] 点击"开始练习"后，以更大字号/分步方式呈现 steps
- [ ] 点击"返回步骤列表"后，返回步骤列表视图
- [ ] 容错：少于 2 张时按实际渲染（dev 模式有警告）

#### 下一步清单
- [ ] 显示 2-3 条清单项
- [ ] 每条清单项可勾选"我完成了"
- [ ] 已勾选项显示删除线或灰色
- [ ] 勾选状态保存在 localStorage
- [ ] 刷新页面后，勾选状态仍然存在

### 15.5 降级策略

- [ ] 访问 `?debugInvalid=1` 后，模拟校验失败
- [ ] 校验失败时，UI 不白屏
- [ ] assistant reply 仍以 markdown 渲染
- [ ] 结构化区块（nextStepsLines/actionCards）隐藏
- [ ] Debug 面板显示 `validationError`（含可读的错误原因）
- [ ] 移除 `?debugInvalid=1` 后，恢复正常渲染

### 15.6 Debug 面板

- [ ] 默认隐藏
- [ ] 点击"显示 Debug"按钮后展开
- [ ] 显示 `debugPrompts`（如果 DEBUG_PROMPTS=1）
  - [ ] System Prompt
  - [ ] User Prompt
  - [ ] Selected Skills（如果有）
  - [ ] Selection Reason（如果有）
- [ ] 显示 `validationError`（如果校验失败）
- [ ] 点击"隐藏 Debug"按钮后收起

### 15.7 移动端可用性

- [ ] 输入框 sticky + safe-area：键盘弹出不遮挡输入
- [ ] 消息区可正常滚动
- [ ] 发送按钮可点击
- [ ] 超长消息（>1000 字）不撑爆布局
- [ ] 代码块/列表渲染正常
- [ ] 行动卡片在移动端单列显示

### 15.8 状态持久化

- [ ] 对话历史保存在 localStorage
- [ ] 刷新页面后，对话历史仍然存在
- [ ] 下一步清单的勾选状态保存在 localStorage
- [ ] 刷新页面后，勾选状态仍然存在
- [ ] 状态信息（`state`、`routeType`、`assessmentStage`）正确传递

### 15.9 输入交互

- [ ] Enter 键发送消息
- [ ] Shift+Enter 换行
- [ ] 加载状态显示（"发送中..."和加载动画）
- [ ] 发送期间输入框禁用

### 15.10 错误处理

- [ ] 网络错误时显示错误提示
- [ ] 错误信息清晰易懂
- [ ] 可以继续输入和发送（错误不影响后续操作）

### 15.11 性能

- [ ] 页面加载时间 < 2s
- [ ] 消息发送响应时间合理（依赖后端）
- [ ] 滚动流畅（60fps）

### 15.12 代码质量

- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过（如果有）
- [ ] `npm run build` 通过
- [ ] 无 TypeScript 错误
- [ ] 无 ESLint 警告

---

**验证完成标准**：所有验证点均通过 ✅

**验证日期**：_____________  
**验证人**：_____________  
**备注**：_____________
