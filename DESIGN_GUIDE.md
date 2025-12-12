# 心理疗愈助手 - 设计风格指南

> 本文档定义了心理疗愈助手项目的视觉和交互设计规范，用于指导后续设计风格的稳定输出。

## 一、设计理念

### 核心原则

1. **温暖包容**：营造安全、信任的对话环境，让用户感到被理解和支持
2. **清晰易读**：确保所有文字信息清晰可见，符合无障碍设计标准
3. **平静舒缓**：使用柔和的色彩，避免视觉刺激，适合心理咨询场景
4. **专业可靠**：保持专业感，同时不失亲和力

### 设计目标

- 降低用户使用门槛，让对话自然流畅
- 通过视觉设计传达温暖和支持
- 确保信息层次清晰，重点突出
- 符合 WCAG AA 无障碍标准（对比度 ≥ 4.5:1）

## 二、色彩系统

### 主色调

| 用途 | Tailwind 类名 | 十六进制 | RGB | 说明 |
|------|---------------|---------|-----|------|
| **主色（Primary）** | `blue-500` | `#3B82F6` | rgb(59, 130, 246) | 信任、专业，用于主要操作按钮 |
| **主色悬停** | `blue-600` | `#2563EB` | rgb(37, 99, 235) | 按钮悬停状态 |
| **辅助色（Success）** | `green-500` | `#10B981` | rgb(16, 185, 129) | 希望、成长（预留） |
| **背景主色** | `gray-100` | `#F3F4F6` | rgb(243, 244, 246) | 页面主背景 |
| **背景次色** | `gray-50` | `#F9FAFB` | rgb(249, 250, 251) | 空状态背景 |

### 文字颜色

| 用途 | Tailwind 类名 | 十六进制 | 对比度 | 说明 |
|------|---------------|---------|--------|------|
| **主文字** | `gray-900` | `#111827` | ≥ 7:1 | 标题、重要内容 |
| **次文字** | `gray-700` | `#374151` | ≥ 4.5:1 | 副标题、描述文字 |
| **辅助文字** | `gray-600` | `#4B5563` | ≥ 4.5:1 | 时间戳、提示文字 |
| **次要文字** | `gray-500` | `#6B7280` | ≥ 3:1 | Placeholder、禁用状态 |
| **白色文字** | `white` | `#FFFFFF` | - | 深色背景上的文字 |

### 情绪标签颜色系统

情绪标签采用**浅色背景 + 深色文字**的组合，确保高对比度和可读性：

| 情绪 | 背景色 | 文字色 | 边框色 | 进度条色 | Tailwind 类名 |
|------|--------|--------|--------|----------|---------------|
| **焦虑** | `yellow-200` | `yellow-900` | `yellow-400` | `yellow-500` | `bg-yellow-200 text-yellow-900 border-yellow-400` |
| **抑郁** | `blue-200` | `blue-900` | `blue-400` | `blue-500` | `bg-blue-200 text-blue-900 border-blue-400` |
| **愤怒** | `red-200` | `red-900` | `red-400` | `red-500` | `bg-red-200 text-red-900 border-red-400` |
| **悲伤** | `gray-200` | `gray-900` | `gray-400` | `gray-500` | `bg-gray-200 text-gray-900 border-gray-400` |
| **恐惧** | `purple-200` | `purple-900` | `purple-400` | `purple-500` | `bg-purple-200 text-purple-900 border-purple-400` |
| **快乐** | `green-200` | `green-900` | `green-400` | `green-500` | `bg-green-200 text-green-900 border-green-400` |
| **平静** | `indigo-200` | `indigo-900` | `indigo-400` | `indigo-500` | `bg-indigo-200 text-indigo-900 border-indigo-400` |

**使用规范**：
- 所有情绪标签必须使用 `font-semibold`（字重 600）
- 边框使用 `border-2`（2px 宽度）
- 添加 `shadow-sm` 轻微阴影提升层次感

### 语义颜色

| 状态 | 背景色 | 文字色 | 边框色 | 用途 |
|------|--------|--------|--------|------|
| **错误** | `red-50` | `red-700` | `red-500` (左侧边框) | 错误提示 |
| **成功** | `green-50` | `green-700` | `green-500` | 成功提示（预留） |
| **警告** | `yellow-50` | `yellow-700` | `yellow-500` | 警告提示（预留） |
| **信息** | `blue-50` | `blue-700` | `blue-500` | 信息提示（预留） |

## 三、字体系统

### 字体族

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 
  'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 
  'Helvetica Neue', sans-serif;
```

**说明**：使用系统默认字体栈，确保跨平台一致性和性能。

### 字号层级

| 用途 | Tailwind 类名 | 像素值 | 字重 | 行高 | 示例 |
|------|---------------|--------|------|------|------|
| **标题（H1）** | `text-xl` | 20px | `font-bold` (700) | `leading-tight` (1.25) | 页面主标题 |
| **副标题** | `text-sm` | 14px | `font-medium` (500) | `leading-normal` (1.5) | 页面副标题 |
| **正文** | `text-base` | 16px | `font-normal` (400) | `leading-relaxed` (1.625) | 消息内容 |
| **辅助文字** | `text-xs` | 12px | `font-medium` (500) | `leading-normal` (1.5) | 时间戳、提示 |
| **标签文字** | `text-xs` | 12px | `font-semibold` (600) | `leading-normal` (1.5) | 情绪标签 |

### 字重规范

- `font-normal` (400)：正文内容
- `font-medium` (500)：副标题、提示文字
- `font-semibold` (600)：情绪标签、分数显示
- `font-bold` (700)：页面主标题

## 四、间距系统

### 基础间距单位

基于 Tailwind 的 4px 基础单位：

| Tailwind 类名 | 像素值 | 用途 |
|---------------|--------|------|
| `gap-2` | 8px | 组件内部小间距 |
| `gap-2.5` | 10px | 情绪标签组件间距 |
| `gap-4` | 16px | 组件间距 |
| `px-2` | 8px | 水平内边距（小） |
| `px-3` | 12px | 水平内边距（中） |
| `px-4` | 16px | 水平内边距（标准） |
| `py-1.5` | 6px | 垂直内边距（小） |
| `py-2` | 8px | 垂直内边距（中） |
| `py-3` | 12px | 垂直内边距（标准） |
| `mb-4` | 16px | 消息气泡间距 |

### 组件内边距规范

| 组件 | 内边距 | Tailwind 类名 |
|------|--------|---------------|
| **消息气泡** | 16px × 12px | `px-4 py-3` |
| **输入框** | 16px × 8px | `px-4 py-2` |
| **按钮** | 24px × 8px | `px-6 py-2` |
| **情绪标签** | 12px × 6px | `px-3 py-1.5` |
| **头部** | 16px × 12px | `px-4 py-3` |

## 五、圆角与阴影

### 圆角规范

| 用途 | Tailwind 类名 | 像素值 | 说明 |
|------|---------------|--------|------|
| **标准圆角** | `rounded-lg` | 8px | 消息气泡、按钮、输入框 |
| **中等圆角** | `rounded-md` | 6px | 情绪标签 |
| **完全圆角** | `rounded-full` | 9999px | 进度条、加载动画圆点 |

### 阴影规范

| 用途 | Tailwind 类名 | 说明 |
|------|---------------|------|
| **轻微阴影** | `shadow-sm` | 消息气泡、情绪标签，提升层次感 |
| **内阴影** | `shadow-inner` | 进度条背景，营造凹陷感 |
| **头部阴影** | `shadow-sm` | 页面头部，与内容区分 |

## 六、组件样式规范

### 1. 消息气泡（MessageBubble）

#### AI 消息气泡

```tsx
className="max-w-[80%] rounded-lg px-4 py-3 shadow-sm 
  bg-white text-gray-900 border border-gray-200"
```

**规范**：
- 最大宽度：80%（响应式）
- 背景：白色
- 文字：`gray-900`
- 边框：`border-gray-200`（1px）
- 圆角：`rounded-lg` (8px)
- 阴影：`shadow-sm`
- 行高：`leading-relaxed` (1.625)

#### 用户消息气泡

```tsx
className="max-w-[80%] rounded-lg px-4 py-3 shadow-sm 
  bg-blue-600 text-white"
```

**规范**：
- 背景：`blue-600`（深蓝）
- 文字：白色
- 其他规范与 AI 消息相同

### 2. 输入框（ChatInput）

#### 文本输入框

```tsx
className="flex-1 resize-none rounded-lg border border-gray-300 
  px-4 py-2 text-gray-900 placeholder:text-gray-500
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
  disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
  max-h-32 overflow-y-auto transition-colors duration-200"
style={{ minHeight: '44px', height: 'auto' }}
```

**规范**：
- 最小高度：44px（符合触摸目标标准）
- 默认边框：`border-gray-300`
- 聚焦边框：`border-blue-500` + `ring-2 ring-blue-500`
- Placeholder：`text-gray-500`（对比度 ≥ 3:1）
- 禁用状态：`bg-gray-100` + `text-gray-500`
- 过渡动画：`transition-colors duration-200`

### 3. 按钮（Button）

#### 主按钮（发送按钮）

```tsx
className="px-6 py-2 rounded-lg font-medium transition-colors
  bg-blue-500 text-white hover:bg-blue-600
  disabled:bg-gray-300 disabled:cursor-not-allowed
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
```

**规范**：
- 背景：`bg-blue-500`
- 悬停：`bg-blue-600`
- 禁用：`bg-gray-300`
- 聚焦：蓝色光晕（`ring-2 ring-blue-500`）
- 过渡：`transition-colors`

#### 次要按钮（清空对话）

```tsx
className="px-4 py-2 text-sm font-medium text-gray-700 
  hover:text-gray-900 hover:bg-gray-100 rounded-lg 
  transition-colors border border-gray-300"
```

**规范**：
- 背景：透明
- 边框：`border-gray-300`
- 悬停：`bg-gray-100` + `text-gray-900`

### 4. 情绪标签（EmotionIndicator）

#### 标签样式

```tsx
className="px-3 py-1.5 rounded-md border-2 text-xs font-semibold shadow-sm
  {EMOTION_COLORS[label]}"
```

**规范**：
- 内边距：`px-3 py-1.5` (12px × 6px)
- 圆角：`rounded-md` (6px)
- 边框：`border-2` (2px)
- 字重：`font-semibold` (600)
- 阴影：`shadow-sm`
- 颜色：根据情绪类型使用对应的 `EMOTION_COLORS`

#### 进度条样式

```tsx
// 背景
className="h-2.5 bg-gray-300 rounded-full overflow-hidden shadow-inner"

// 进度
className="h-full transition-all duration-300 rounded-full
  {EMOTION_PROGRESS_COLORS[label]}"
style={{ width: `${percentage}%` }}
```

**规范**：
- 高度：`h-2.5` (10px)
- 背景：`bg-gray-300`
- 进度颜色：根据情绪类型使用对应的 `EMOTION_PROGRESS_COLORS`
- 动画：`transition-all duration-300`
- 内阴影：`shadow-inner`

#### 分数显示

```tsx
className="text-xs font-semibold text-gray-700 min-w-[35px]"
```

**规范**：
- 字号：`text-xs` (12px)
- 字重：`font-semibold` (600)
- 颜色：`text-gray-700`
- 最小宽度：35px（确保对齐）

### 5. 时间戳（Timestamp）

```tsx
// 用户消息时间戳
className="text-xs px-2 font-medium text-gray-500"

// AI 消息时间戳
className="text-xs px-2 font-medium text-gray-600"
```

**规范**：
- 字号：`text-xs` (12px)
- 字重：`font-medium` (500)
- 用户消息：`text-gray-500`
- AI 消息：`text-gray-600`

### 6. 加载动画（Loading）

```tsx
<div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
  <div className="flex gap-1.5">
    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" 
      style={{ animationDelay: '0ms' }} />
    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" 
      style={{ animationDelay: '150ms' }} />
    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" 
      style={{ animationDelay: '300ms' }} />
  </div>
</div>
```

**规范**：
- 圆点大小：`w-2.5 h-2.5` (10px × 10px)
- 颜色：`bg-blue-500`
- 动画：`animate-bounce`
- 延迟：0ms, 150ms, 300ms（依次弹跳）

### 7. 错误提示（Error）

```tsx
className="bg-red-50 border-l-4 border-red-500 text-red-700 
  px-4 py-3 mx-4 mt-4 rounded"
```

**规范**：
- 背景：`bg-red-50`
- 左侧边框：`border-l-4 border-red-500` (4px)
- 文字：`text-red-700`
- 圆角：`rounded` (4px)

### 8. 头部（Header）

```tsx
className="bg-white border-b border-gray-200 shadow-sm 
  px-4 py-3 flex items-center justify-between"
```

**规范**：
- 背景：白色
- 底部边框：`border-b border-gray-200`
- 阴影：`shadow-sm`
- 内边距：`px-4 py-3` (16px × 12px)

## 七、交互规范

### 1. 过渡动画

| 属性 | 类名 | 持续时间 | 说明 |
|------|------|---------|------|
| **颜色过渡** | `transition-colors` | 200ms | 按钮、输入框状态变化 |
| **全部过渡** | `transition-all` | 300ms | 进度条动画 |

### 2. 聚焦状态

所有可交互元素必须有清晰的聚焦指示：

- **输入框**：`focus:ring-2 focus:ring-blue-500 focus:border-blue-500`
- **按钮**：`focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`
- **移除默认轮廓**：`focus:outline-none`

### 3. 悬停状态

- **主按钮**：`hover:bg-blue-600`
- **次要按钮**：`hover:bg-gray-100 hover:text-gray-900`
- **过渡效果**：`transition-colors`

### 4. 禁用状态

- **输入框**：`disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed`
- **按钮**：`disabled:bg-gray-300 disabled:cursor-not-allowed`

### 5. 键盘交互

- **Enter**：发送消息
- **Shift + Enter**：换行
- **Tab**：切换焦点（支持键盘导航）

## 八、响应式设计

### 断点规范

| 设备 | 宽度 | Tailwind 断点 |
|------|------|---------------|
| **移动端** | < 640px | 默认 |
| **平板** | ≥ 640px | `sm:` |
| **桌面** | ≥ 1024px | `lg:` |

### 布局规范

- **消息气泡最大宽度**：`max-w-[80%]`（移动端和桌面端一致）
- **输入框**：全宽，最小高度 44px
- **头部**：全宽，固定高度

## 九、无障碍设计

### 对比度标准

| 元素类型 | WCAG 标准 | 实际对比度 | 状态 |
|---------|-----------|-----------|------|
| **正文文字** | AA (4.5:1) | ≥ 7:1 | ✅ 符合 AAA |
| **次要文字** | AA (4.5:1) | ≥ 4.5:1 | ✅ 符合 AA |
| **Placeholder** | 最低 3:1 | ≥ 3:1 | ✅ 符合 |
| **情绪标签** | AA (4.5:1) | ≥ 7:1 | ✅ 符合 AAA |

### 交互元素

- **最小触摸目标**：44×44px（符合 iOS/Android 标准）
- **焦点指示**：清晰的蓝色光晕
- **键盘导航**：支持 Tab 键切换焦点

### 语义化 HTML

- 使用语义化标签（`<header>`, `<form>`, `<button>` 等）
- 提供适当的 `aria-label`（如需要）
- 确保表单元素有正确的 `label` 关联

## 十、代码实现规范

### Tailwind CSS 类名组织

```tsx
// 推荐：使用 cn() 工具函数组织类名
className={cn(
  '基础样式',
  '状态样式',
  '响应式样式',
  condition && '条件样式'
)}
```

### 颜色使用

**✅ 正确**：使用预定义的颜色常量

```tsx
import { EMOTION_COLORS } from '@/lib/constants';
className={cn('px-3 py-1.5 rounded-md border-2', EMOTION_COLORS[label])}
```

**❌ 错误**：硬编码颜色值

```tsx
className="px-3 py-1.5 rounded-md border-2 bg-yellow-200 text-yellow-900"
```

### 组件样式复用

创建可复用的样式常量：

```typescript
// lib/styles/button.ts
export const BUTTON_STYLES = {
  primary: 'px-6 py-2 rounded-lg font-medium transition-colors bg-blue-500 text-white hover:bg-blue-600',
  secondary: 'px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-gray-300',
};
```

## 十一、设计检查清单

在创建新组件或修改现有组件时，请检查：

### 视觉检查

- [ ] 文字对比度符合 WCAG AA 标准（≥ 4.5:1）
- [ ] 重要文字对比度符合 WCAG AAA 标准（≥ 7:1）
- [ ] Placeholder 文字清晰可见（≥ 3:1）
- [ ] 情绪标签对比度足够（深色文字 + 浅色背景）
- [ ] 所有交互元素有清晰的聚焦状态
- [ ] 按钮状态清晰（默认/悬停/禁用）

### 交互检查

- [ ] 所有按钮有悬停和聚焦状态
- [ ] 输入框有清晰的聚焦指示
- [ ] 过渡动画流畅（200-300ms）
- [ ] 加载状态友好（动画、提示文字）
- [ ] 错误状态清晰（颜色、图标、文字）

### 响应式检查

- [ ] 移动端布局正常
- [ ] 消息气泡宽度合适（max-w-[80%]）
- [ ] 输入框最小高度 44px
- [ ] 文字大小在小屏幕上可读

### 无障碍检查

- [ ] 键盘导航可用（Tab 键）
- [ ] 焦点指示清晰
- [ ] 语义化 HTML 标签
- [ ] 对比度符合标准

## 十二、常见问题与解决方案

### Q1: Placeholder 文字看不清怎么办？

**解决方案**：

```css
/* 在 globals.css 中添加 */
textarea::placeholder,
input::placeholder {
  @apply text-gray-500;
  opacity: 1;
}
```

### Q2: 情绪标签对比度不够？

**解决方案**：确保使用 `EMOTION_COLORS` 常量，它已经配置了高对比度组合（如 `bg-yellow-200 text-yellow-900`）。

### Q3: 按钮聚焦状态不明显？

**解决方案**：使用 `focus:ring-2 focus:ring-blue-500 focus:ring-offset-2` 创建清晰的聚焦光晕。

### Q4: 如何保持设计一致性？

**解决方案**：

1. 使用预定义的颜色常量（`EMOTION_COLORS`, `EMOTION_PROGRESS_COLORS`）
2. 遵循本文档中的组件样式规范
3. 使用 `cn()` 工具函数组织类名
4. 定期检查设计检查清单

## 十三、更新日志

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2024-12-12 | 1.0 | 初始版本，定义完整的设计风格规范 |

---

**文档维护**：本文档应与代码库同步更新。如有设计变更，请及时更新本文档。

**参考资源**：

- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [WCAG 无障碍指南](https://www.w3.org/WAI/WCAG21/quickref/)
- [Material Design 设计规范](https://material.io/design)
