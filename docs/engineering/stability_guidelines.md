# 工程稳定性与开发规范 (Engineering Stability Guidelines)

为了确保系统的稳定性和可预测性，避免出现“生成数据与校验规则冲突”等低级错误，建议遵循以下工程准则：

## 1. 规则一致性 (Rule Consistency)
*   **单一事实来源**：业务逻辑中的长度上限、格式要求（如邀请码 6-8 位）应在文档（`user_system_architecture.md`）和代码中同步。
*   **Schema 驱动**：强制使用 Zod 或类似的 Schema 库进行前后端校验，确保校验逻辑的一致性。

## 2. 变更自洽性 (Self-Consistency in Changes)
*   **生成 vs 校验**：作为 AI 助手，在生成数据（如“生成一个邀请码”）前，必须先检索代码库中对应的校验逻辑（搜索 `z.string()` 或 `maxLength`）。
*   **同步更新**：当修改需求（如“支持 8 位邀请码”）时，必须联动修改：
    *   前端表单 `input` 的 `maxLength` / `minLength`。
    *   后端 Server Action 的数据校验逻辑（Zod Schema）。
    *   文档说明。

## 3. 稳健性保障措施 (Robustness Measures)
*   **错误边界处理**：前端应提供清晰的错误提示（已在 `app/login/page.tsx` 中实现）。
*   **日志显性化**：对于校验失败的请求，后端应记录具体的失败原因，便于快速定位是格式问题还是业务逻辑逻辑问题。
*   **自动化测试**：建议针对核心校验逻辑（如 `register.ts` 中的 Schema）编写单元测试，防止回归。

## 4. AI 协作反思 (Reflections on AI Collaboration)
*   **主动检索**：AI 在执行任务前应“多看一眼”现有的约束。
*   **文档勤写**：对于任何非显而易见的业务规则，应习惯性地记录在 `docs/` 下，这不仅是给人类看，也是给未来的 AI 上下文提供参考。
