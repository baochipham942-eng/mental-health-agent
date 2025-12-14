# CI 检查与配置对齐

本文档说明如何在 Cursor 环境 / 本地对齐 smoke 配置与阈值，确保测试结果的可重复性。

## CI 默认模式

`npm run ci:check` **默认固定**使用 `SKILL_MODE=steps_and_cards` 模式运行完整链路。

**原因**：
- 保证结论输出"单一数据源"来自 Skill 系统，避免 LLM 输出干扰一致性验收
- 保证 `nextStepsLines` 和 `actionCards` 由 Skill 系统单一数据源渲染
- 验证 LLM 输出剥离逻辑（确保 LLM 不生成这些内容）
- 验证 gate/contract 一致性（确保所有验证使用同一套逻辑）
- 提升输出一致性和可维护性

在 CI 环境中，`ci:check` 通过 `cross-env` 在每个步骤中自动设置 `SKILL_MODE=steps_and_cards`，确保跨平台（Windows/Mac/Linux）行为一致，无需手动配置。

## 配置校验

### 基本使用

运行配置校验脚本（默认 warn 模式）：

```bash
npm run verify:config
```

### 严格模式

在严格模式下，任何配置差异都会导致脚本退出并返回错误码：

```bash
SMOKE_STRICT_CONFIG=1 npm run verify:config
```

### 期望配置文件

可以创建 `smoke.config.json` 文件来定义期望的配置值：

```json
{
  "nodeVersion": "v20.11.0",
  "npmVersion": "9.8.1",
  "model": "deepseek-chat",
  "apiUrl": "https://api.deepseek.com/v1/chat/completions",
  "conclusionTemperature": 0.3,
  "conclusionMaxTokens": 300,
  "smokeConclusionP50Ms": 9500,
  "envVars": {
    "SKILL_MODE": "steps_and_cards",
    "GATE_FIX": "enabled (default)",
    "DEBUG_PROMPTS": "[未设置]"
  }
}
```

或者通过环境变量指定配置文件路径：

```bash
SMOKE_EXPECTED_CONFIG_JSON=./my-config.json npm run verify:config
```

### 校验项

配置校验脚本会检查以下内容：

1. **Node/npm 版本**
   - Node.js >= 18.0.0
   - npm >= 9.0.0
   - 如果提供了期望配置，会检查版本是否完全匹配

2. **Git 状态**
   - 检查工作区是否有未提交的更改（警告）

3. **LLM 配置**
   - API Key 是否设置（错误）
   - Model、API URL、Temperature、Max Tokens 是否匹配期望值（警告）

4. **环境变量**
   - `SKILL_MODE`
   - `GATE_FIX`
   - `DEBUG_PROMPTS`
   - `CONCLUSION_INCLUDE_HISTORY`
   - `SMOKE_CONCLUSION_P50_MS`

## CI 检查命令

运行完整的 CI 检查流程（按顺序执行）：

```bash
npm run ci:check
```

该命令会依次执行：

1. `npm run verify:config` - 配置校验（默认 warn 模式）
2. `npm run typecheck` - TypeScript 类型检查
3. `npm run validate:skills` - Skill 定义验证
4. `npm run test:contract` - Contract 回归用例
5. `npm run test:contract:edge` - Contract 边界用例测试
6. `npm run test:strip` - Conclusion 输出剥离回归用例
7. `npm run smoke` - 冒烟测试

任一步骤失败，整个流程会终止。

### 默认 warn 模式的作用

`verify:config` 默认使用 warn 模式，这意味着：
- **警告**：发现配置差异时，只输出警告信息，不会中断流程
- **错误**：只有严重错误（如 API Key 未设置）才会中断流程

这样设计的好处：
- 在开发环境中，允许配置差异，方便调试
- 在 CI 环境中，可以通过 `SMOKE_STRICT_CONFIG=1` 开启严格模式

### Strict 模式如何开启

在 CI 环境中，建议使用严格模式确保配置一致性：

```bash
# 方式1：通过环境变量
SMOKE_STRICT_CONFIG=1 npm run ci:check

# 方式2：在 CI 配置文件中设置
# GitHub Actions 示例
env:
  SMOKE_STRICT_CONFIG: "1"
```

在严格模式下：
- 任何配置差异（包括警告）都会导致脚本退出并返回错误码
- 确保 CI 环境与期望配置完全一致

### smoke.config.json 推荐写法

创建 `smoke.config.json` 文件来定义期望的配置值：

```json
{
  "nodeVersion": "v20.11.0",
  "npmVersion": "9.8.1",
  "model": "deepseek-chat",
  "apiUrl": "https://api.deepseek.com/v1/chat/completions",
  "conclusionTemperature": 0.3,
  "conclusionMaxTokens": 300,
  "smokeConclusionP50Ms": 9500,
  "envVars": {
    "SKILL_MODE": "steps_and_cards",
    "GATE_FIX": "enabled (default)",
    "DEBUG_PROMPTS": "[未设置]",
    "CONCLUSION_INCLUDE_HISTORY": "[未设置]"
  }
}
```

### SMOKE_EXPECTED_CONFIG_JSON 使用

如果不想使用默认的 `smoke.config.json` 文件名，可以通过环境变量指定：

```bash
SMOKE_EXPECTED_CONFIG_JSON=./ci-config.json npm run verify:config
```

这在以下场景很有用：
- 不同环境使用不同的配置文件
- CI 环境使用专门的配置文件
- 临时使用特定配置进行测试

## 必须的 Secret 配置

### DEEPSEEK_API_KEY

**必须设置**，用于调用 DeepSeek API。

#### 本地环境设置

1. 在项目根目录创建 `.env.local` 文件（如果不存在）
2. 添加以下内容：

```bash
DEEPSEEK_API_KEY=your_api_key_here
```

3. 如果开发服务器正在运行，需要重启才能生效

#### CI 环境设置

**GitHub Actions**:
1. 进入仓库 Settings > Secrets and variables > Actions
2. 点击 "New repository secret"
3. Name: `DEEPSEEK_API_KEY`
4. Secret: 你的 API Key
5. 点击 "Add secret"

**Vercel**:
1. 进入项目 Settings > Environment Variables
2. 添加变量：
   - Key: `DEEPSEEK_API_KEY`
   - Value: 你的 API Key
   - Environment: Production, Preview, Development（根据需要选择）
3. 点击 "Save"

**其他 CI 系统**:
在 CI 系统的环境变量/Secret 配置中添加 `DEEPSEEK_API_KEY`

## 本地跑通 ci:check 的最小步骤（不改代码版）

**重要说明**：代码改动已包含在仓库中，本地不需要再手改任何 TS/JS 文件，只需同步代码+装依赖+补环境变量即可。

### 完整步骤

1. **同步代码**
   ```bash
   git pull
   ```

2. **安装依赖**
   ```bash
   npm i
   ```

3. **创建/更新 .env.local**
   
   在项目根目录创建或更新 `.env.local` 文件，至少包含：
   ```bash
   DEEPSEEK_API_KEY=your_api_key_here
   ```
   
   **注意**：如果 `npm run dev` 正在运行，需要重启开发服务器才能让环境变量生效。

4. **运行 CI 检查**
   ```bash
   npm run ci:check
   ```

### 预期现象

- **如果 DEEPSEEK_API_KEY 已设置**：
  - `verify:config` 会显示 `DEEPSEEK_API_KEY: [已设置]`
  - 所有检查步骤会依次执行并通过

- **如果 DEEPSEEK_API_KEY 未设置**：
  - `verify:config` 会显示 `DEEPSEEK_API_KEY: [未设置]`
  - 会输出详细的错误提示和修复步骤
  - 流程会在 `verify:config` 阶段终止

### 说明

- `ci:check` 会自动使用 `SKILL_MODE=steps_and_cards` 模式，无需手动设置
- 所有代码改动已包含在仓库中，本地无需修改任何代码文件
- 只需确保环境变量配置正确即可

## 本地运行 ci:check 的最小准备（详细版）

### 1. 安装依赖

```bash
npm i
```

### 2. 设置 DEEPSEEK_API_KEY

按照上面的"本地环境设置"步骤配置，创建 `.env.local` 文件并添加 `DEEPSEEK_API_KEY`。

### 3. 可选：本地也设置 SKILL_MODE=steps_and_cards

为了与 CI 行为一致，可以在 `.env.local` 中添加 `SKILL_MODE=steps_and_cards`（但注意 `ci:check` 会强制使用此模式）。

### 4. 推荐：干净工作区

为了确保测试结果的可重复性，建议在运行 `ci:check` 前确保工作区干净：

```bash
# 检查工作区状态
git status

# 如果需要，清理未跟踪的文件（谨慎使用）
git clean -fd
```

### 5. 运行 CI 检查

```bash
# 使用默认的 steps_and_cards 模式（推荐，ci:check 会强制使用此模式）
npm run ci:check
```

## 在 Cursor 环境中对齐配置

### 1. 检查当前配置

```bash
npm run verify:config
```

### 2. 创建期望配置文件

如果发现配置差异，可以创建 `smoke.config.json` 文件来记录期望的配置值。

### 3. 使用严格模式

在 CI/CD 流程中使用严格模式，确保配置一致性：

```bash
SMOKE_STRICT_CONFIG=1 npm run verify:config
```

### 4. 运行完整 CI 检查

```bash
npm run ci:check
```

## 常见问题

### Q: 为什么我的本地测试通过了，但 CI 失败了？

A: 可能是配置差异导致的。运行 `npm run verify:config` 检查配置差异，特别是：
- Node/npm 版本
- 环境变量设置
- LLM API 配置

### Q: 如何确保 Cursor 环境和本地环境配置一致？

A: 
1. 创建 `smoke.config.json` 文件记录期望配置
2. 在 Cursor 和本地都运行 `SMOKE_STRICT_CONFIG=1 npm run verify:config` 确保配置一致
3. 使用相同的 Node/npm 版本

### Q: 配置校验失败怎么办？

A: 
- 如果是警告（warn 模式），可以继续运行测试，但建议修复配置差异
- 如果是错误（如 API Key 未设置），必须修复后才能运行测试
  - 查看错误输出中的"如何修复"提示
  - 按照提示在本地或 CI 环境中设置相应的环境变量
- 在严格模式下，任何差异都会导致失败

### Q: 为什么 ci:check 默认使用 steps_and_cards 模式？

A: 
- 确保 Skill 系统的单一数据源原则（nextSteps 和 actionCards 完全由 Skill 系统生成）
- 验证 LLM 输出剥离逻辑的正确性
- 验证 gate/contract 一致性
- 提升输出一致性和可维护性

### Q: 本地开发时如何测试不同的 SKILL_MODE？

A: 
```bash
# 测试 off 模式
SKILL_MODE=off npm run smoke

# 测试 cards_only 模式
SKILL_MODE=cards_only npm run smoke

# 测试 steps_and_cards 模式（默认）
SKILL_MODE=steps_and_cards npm run smoke
# 或直接
npm run ci:check
```

## Contract 边界用例测试

`test:contract:edge` 专门覆盖 Contract 验证的边界场景，确保规则正确性：

### 目的

1. **防止历史 bug 回归**：专门测试"完成标准(rightPart)数字误判为 metric"的历史坑
   - 确保完成标准中的数字（如"至少5次"）不会被误判为主句部分的时长/次数
   - 验证 leftPart/rightPart 拆分逻辑的正确性

2. **验证新增 metric 规则**：测试新增的 metric 识别规则
   - `\d+次` 表达（如"做3次""练习2次"）
   - `每次\d+分钟/小时` 表达（如"每次3分钟""每次10分钟"）

3. **边界场景覆盖**：测试各种边界情况
   - 英文分号冒号的完成标准格式
   - 多种 metric 表达组合
   - 完成标准有数字但主句也有 metric 的情况

### 本地运行

```bash
npm run test:contract:edge
```

### CI 集成

`test:contract:edge` 已集成到 `ci:check` 流程中，在 `test:contract` 之后、`test:strip` 之前执行。

**失败意味着**：
- Contract 规则可能被改坏（如 leftPart/rightPart 拆分逻辑出错）
- Prompt 产出格式漂移（如完成标准格式变化导致拆分失败）
- 新增的 metric 规则未正确实现

### 验收报告

`test:contract:edge` 的集成验收报告已归档，包含完整的测试结果和 CI 证明：

- 📄 [2025-12-14 Contract Edge CI Acceptance Report](../acceptance/2025-12-14-contract-edge-ci-acceptance.md)
  - 包含 `test:contract:edge` 10/10 测试通过结果
  - 包含 `ci:check` 全链路通过的关键输出片段
  - 作为可追溯的验收证据（含 Git Hash、工作区状态等元信息）

## 相关命令

- `npm run verify:config` - 配置校验（warn 模式）
- `SMOKE_STRICT_CONFIG=1 npm run verify:config` - 配置校验（strict 模式）
- `npm run ci:check` - 完整 CI 检查（自动设置 `SKILL_MODE=steps_and_cards`，包含所有验证步骤）
- `npm run typecheck` - TypeScript 类型检查
- `npm run validate:skills` - Skill 定义验证
- `npm run test:contract` - Contract 回归用例
- `npm run test:contract:edge` - Contract 边界用例测试
- `npm run test:strip` - Conclusion 输出剥离回归用例
- `npm run smoke` - 冒烟测试

## .env.local 示例

创建 `.env.local` 文件（不要提交到 Git）：

```bash
# DeepSeek API Key（必须）
DEEPSEEK_API_KEY=your_api_key_here

# Skill 模式（推荐使用 steps_and_cards）
SKILL_MODE=steps_and_cards

# 可选：调试模式
# DEBUG_PROMPTS=1

# 可选：门禁修复（默认启用）
# GATE_FIX=1

# 可选：结论包含历史（默认不包含）
# CONCLUSION_INCLUDE_HISTORY=1

# 可选：性能阈值（默认 9500ms）
# SMOKE_CONCLUSION_P50_MS=9500
```

**注意**：`.env.local` 文件应添加到 `.gitignore` 中，不要提交到版本控制系统。
