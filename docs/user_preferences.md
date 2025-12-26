# 用户偏好与项目规范 (User Preferences & Project Charter)

> [!IMPORTANT]
> **Language Preference**: Chinese (中文)
> **Default**: All AI responses, code comments, and documentation must be in **Chinese**.
> **Requires**:
> - **实施计划 (Implementation Plan)**: 必须全中文编写。
> - **思维链 (Thinking Process)**: 展示给用户的思考过程必须是中文。

这份文档仅记录**核心开发规范**与**非架构性的用户偏好**。
这部分内容补充了 [README](../../README.md) 和 [架构文档](./architecture/current-architecture.md) 中未提及的操作准则。

## 一、工作流程规范 (Workflow & Process)

### 1. 验证优先 (Verify Before Notify)
- **严格规定**：在完成代码修改或 Bug 修复后，**必须先进行测试验证**（如运行评估脚本、本地测试等），确认问题已解决。
- **流程**：`修改代码` -> `运行验证` -> `确认通过` -> `通知用户`。
- **禁止行为**：禁止在未验证代码是否生效的情况下直接通知用户“已完成”。

### 2. 路由与文件结构 (Routing & Structure)
- **路由测试规范**：验证核心功能时，**必须严格参考 `app/` 目录下的文件夹结构确认有效路由**。
  - 例如：必须确认 `app/c/[sessionId]/page.tsx` 存在，才能在测试中使用 `/c/:id` 路径。
  - **禁止**：使用项目中不存在的路径（如 `/chat/new` 等）进行测试或示例说明。

## 二、部署与安全偏好 (Deployment & Security)

> 架构细节请参考 [详细架构文档](./architecture/current-architecture.md)

1. **部署限制**：
   - 首选部署为 **Vercel**。
   - 必须注意 Vercel Function 的超时限制（Hobby 10s / Pro 60s）。
   - 代码库必须保持为 **GitHub Private Repo**。

2. **安全强制**：
   - 所有敏感密钥（DeepSeek API Key, Database URL, Groq Key）**必须通过环境变量注入**。
   - **严禁**将密钥硬编码在代码文件中。

## 三、相关文档索引

- **系统架构与链路**：见 [current-architecture.md](./architecture/current-architecture.md)
- **技术栈与快速开始**：见项目根目录 [README](../../README.md)
