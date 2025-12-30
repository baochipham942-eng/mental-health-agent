# 部署宪法 (Deployment Constitution)

> **⚠️ 最高优先级文档**
> 本文档定义了项目的核心部署规则与开发原则。任何操作**必须**遵守本宪法。

## 0. 开发与文档原则 (Development Principles)

### 0.1 语言偏好 (Language Preference)
> **Default**: All AI responses, code comments, and documentation must be in **Chinese (中文)**.
> **Requires**:
> - **实施计划 (Implementation Plan)**: 必须全中文编写。
> - **思维链 (Thinking Process)**: 展示给用户的思考过程必须是中文。

### 0.2 文档完整性 (Document Integrity)

> **"不要为了快速更新，而覆盖不该被丢失的细节。"**

在更新任何文档（如 `task.md`, `implementation_plan.md`）时：
1.  **增量更新**：除非信息已过时，否则应保留之前的分析、截图记录和避坑指南。
2.  **完整性优先**：由于 Agent 记忆有限，文档是唯一的真理来源。丢失细节等于丢失项目上下文。
3.  **弹性设计**：始终考虑不同设备（小屏/大屏/微信字号）的适配性，不写死像素值。

### 0.3 文档结构规范 (Documentation Structure)
为保持项目根目录整洁，仅保留核心身份文件，其他文档归档至 `docs/`。

**1. 根目录文件 (Root Identity)**
仅保留为项目提供“身份证明”或“最高纲领”的文件：
- `README.md`: 项目入口与快速开始。
- `PROJECT_CONSTITUTION.md`: 项目宪法与核心原则。
- `PROJECT_SUMMARY.md`: 项目全貌与当前状态概览。
- `ARCHITECTURE.md`: 核心架构设计。

**2. `docs/` 归档文件**
其他所有类型的文档一律放入 `docs/` 目录：
- **变更日志**: `CHANGELOG.md`, `SKILL_SYSTEM_CHANGELOG.md` 等。
- **操作手册**: `DEPLOY_CHECKLIST.md`, `VERCEL_DEPLOY.md` 等。
- **设计文档**: `DESIGN_GUIDE.md`, `API.md` 等。
- **临时记录**: 会议纪要、临时笔记等。

## 1. 架构真相 (Architecture Truth)

本项目采用双重环境架构，必须明确区分：

- **GitHub / Vercel**: 
    - 角色：CI/CD 触发器、构建检查、预览环境。
    - 状态：**代码推送后自动更新**。
    - 限制：**线上域名 `mental.llmxy.xyz` 不指向 Vercel**。Vercel 部署成功**不代表**线上更新。

- **Alibaba Cloud Function Compute (FC)**:
    - 角色：**真实生产环境 (Production)**。
    - 状态：**必须手动触发部署**。
    - 域名：`mental.llmxy.xyz` 指向此处。

### 1.1 包管理器规范 (Package Manager)

> **必须使用 pnpm**：本项目使用 pnpm 作为包管理器，不使用 npm 或 yarn。

**优势**：
- 硬链接机制，节省磁盘空间
- 多项目共享依赖包
- 更快的安装速度

**常用命令**：
```bash
# 安装依赖（替代 npm install）
pnpm install

# 添加新包（替代 npm install xxx）
pnpm add xxx

# 运行脚本（替代 npm run xxx）
pnpm dev
pnpm build

# 清理无用缓存
pnpm store prune
```

**严禁行为**：
- 禁止使用 `npm install` 安装依赖
- 禁止删除 `pnpm-lock.yaml` 文件

## 2. 双重部署原则 (The Dual Deployment Rule)

您必须理解：**Vercel 是"自动挡"，阿里云 FC 是"手动挡"。**
为了保证代码库、预览环境和生产环境的一致性，**必须**严格遵循以下标准流程：

### ✅ 标准部署流程 (The Golden Flow)

**场景**：任何功能上线、Bug 修复或配置更改。

1.  **第一步：提交代码 (触发 Vercel)**
    ```bash
    git add .
    git commit -m "feat: 您的更新内容"
    git push
    ```
    - **作用**：
        1. 代码归档，版本留痕。
        2. **触发 Vercel 自动部署**：保持 `.vercel.app` 预览环境与最新代码一致。
        3. 利用 Vercel 的构建系统检查是否存在 TypeScript/ESLint 错误。

2.  **第二步：发布生产 (更新阿里云)**
    ```bash
    # ⚠️ 只有执行这一步，用户访问的主域名才会更新！
    npm run deploy:build
    s deploy -y
    ```
    - **作用**：将最新代码推送到阿里云函数计算，服务于 `mental.llmxy.xyz` 真实用户。

### 🚫 禁止行为 (The "Ghost Deployment")
**严禁**在不 Push 代码的情况下，直接运行 `s deploy`。
- **后果**：线上运行着 Git 仓库里不存在的"幽灵代码"。Vercel 环境与线上环境分裂。一旦本地代码丢失，线上版本将无法回溯。


## 3. 构建宪法 (Build Constitution)

### 🚫 禁止行为
严禁在生产部署时仅运行 `npm run build` 或 `next build`。

### ✅ 必须行为
**必须**使用专门的构建脚本：
```bash
npm run deploy:build
```

### 📜 理由
本项目使用 Next.js Standalone 模式部署到 FC。
- **Standalone 机制**：默认**不包含** `public/` 和 `.next/static/` 目录。
- **后果**：如果只运行 `next build`，部署后 CSS、JS、图片将全部 **404**，导致页面样式崩塌、交互失效。
- **修复**：`deploy:build` 脚本包含额外的 `cp` 命令，将静态资源手动复制到部署包中。

```bash
# deploy:build 的实际逻辑
npx prisma generate && next build && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
```

## 4. Middleware 宪法 (Middleware Constitution)

### ⚠️ 危险区域
在阿里云 FC 环境中，Middleware 的配置错误会导致致命的静态资源拦截。

### ✅ 必须配置
Middleware 的 `matcher` **必须**严格排除所有静态资源：

```typescript
export const config = {
    matcher: [
      // ... 其他路由规则
      
      // ⚠️ 必须排除规则：
      // 排除 api, _next/static, _next/image, favicon.ico 以及所有常见静态文件扩展名
      '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)',
    ],
};
```

### 📜 理由
- Vercel 会自动处理静态资源，不经过 Middleware。
- **阿里云 FC (Standalone)**：请求可能穿透到 Server，如果 Middleware 拦截了 CSS/JS 请求（未排除），会执行 Auth 逻辑 -> 导致 404 或重定向 -> **样式崩坏**。

## 5. 微信验证特别条款

微信域名验证文件（如 `MP_verify_*.txt`）：
1. 放在 `public` 目录下。
2. 确保 `deploy:build` 会将其复制到 standalone 目录。
3. **推荐**：在 middleware 中显式放行该文件，或者创建一个专门的 API Route / Middleware 逻辑来返回验证内容（双保险）。

---

**每次部署前，请默念本宪法。**

## 6. 工作流程规范 (Workflow & Process)

### 6.1 验证优先 (Verify Before Notify)
- **严格规定**：在完成代码修改或 Bug 修复后，**必须先进行测试验证**（如运行评估脚本、本地测试等），确认问题已解决。
- **流程**：`修改代码` -> `运行验证` -> `确认通过` -> `通知用户`。
- **禁止行为**：禁止在未验证代码是否生效的情况下直接通知用户“已完成”。

### 6.2 路由与文件结构 (Routing & Structure)
- **路由测试规范**：验证核心功能时，**必须严格参考 `app/` 目录下的文件夹结构确认有效路由**。
- **禁止**：使用项目中不存在的路径（如 `/chat/new` 等）进行测试或示例说明。

### 6.3 动态行动计划维护 (Dynamic Action Plan Maintenance)
- **实时更新**：每次完成重大功能改造或修复后，**必须**同步更新 `implementation_plan.md` 的完成进度（标记为 `[x]`）。
- **历史留痕**：对于计划变更或废弃的项目，**严禁直接删除**。必须使用删除线（`~~内容~~`）进行标识，并简要说明原因。这保留了决策路径，防止反复横跳。
- **进度可视化**：计划文件不仅是规划，更是“完成度仪表盘”。

## 7. 安全与环境偏好 (Security & Environment)

### 7.1 安全强制
- **环境变量**：所有敏感密钥（DeepSeek API Key, Database URL, Groq Key）**必须通过环境变量注入**。
- **严禁硬编码**：严禁将密钥直接写入代码文件。
- **代码库安全**：代码库必须保持为 **GitHub Private Repo**。

### 7.2 部署环境限制
- **Vercel 超时**：注意 Vercel Function 的超时限制（Hobby 10s / Pro 60s）。
- **静态资源**：阿里云 FC 部署时必须确保静态资源路径正确（见第 3-4 条）。

## 8. CI/CD 宪法 (CI/CD Constitution)

### 8.1 必经之路
- **合并红线**：任何代码合并主分支前，**必须**通过完整 CI 检查 (`npm run ci:check`)。
- **配置一致性**：CI 环境强制开启 `Strict Mode`，零容忍配置差异。

> 🛠 **详细指南**：见 [CI 检查与配置对齐文档](./docs/ci.md)
