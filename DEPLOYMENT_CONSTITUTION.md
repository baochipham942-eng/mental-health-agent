# 部署宪法 (Deployment Constitution)

> **⚠️ 最高优先级文档**
> 本文档定义了项目的核心部署规则。任何部署操作**必须**遵守本宪法，否则将导致线上环境故障。

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
