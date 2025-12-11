# Vercel 部署详细指南

本文档提供将心理疗愈助手项目部署到 Vercel 的详细步骤。

## 前置要求

- ✅ GitHub/GitLab/Bitbucket 账户
- ✅ Vercel 账户（免费注册：https://vercel.com）
- ✅ DeepSeek API 密钥

## 部署步骤

### 第一步：准备代码仓库

1. 确保代码已提交到 Git 仓库：
   ```bash
   git add .
   git commit -m "准备部署到Vercel"
   git push origin main
   ```

2. 确认以下文件存在：
   - ✅ `package.json` - 包含构建脚本
   - ✅ `vercel.json` - Vercel 配置文件
   - ✅ `next.config.js` - Next.js 配置
   - ✅ `.gitignore` - 已忽略敏感文件

### 第二步：在Vercel中创建项目

1. **访问 Vercel Dashboard**
   - 打开 https://vercel.com/dashboard
   - 使用 GitHub/GitLab/Bitbucket 账户登录

2. **导入项目**
   - 点击 "Add New..." → "Project"
   - 选择你的代码仓库
   - 如果看不到仓库，点击 "Adjust GitHub App Permissions" 授权访问

3. **配置项目**
   - **Project Name**: 输入项目名称（如：mental-health-agent）
   - **Framework Preset**: Next.js（自动检测）
   - **Root Directory**: `./`（默认）
   - **Build Command**: `npm run build`（默认）
   - **Output Directory**: `.next`（默认）

### 第三步：配置环境变量

在 "Environment Variables" 部分添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DEEPSEEK_API_KEY` | `your_api_key_here` | DeepSeek API 密钥（必需） |
| `DEEPSEEK_API_URL` | `https://api.deepseek.com/v1/chat/completions` | API 地址（可选） |

**配置步骤**：
1. 点击 "Environment Variables"
2. 输入变量名和值
3. 选择应用环境（Production、Preview、Development）
4. 点击 "Save"

> 💡 **提示**：建议为所有环境都配置环境变量，确保预览部署也能正常工作。

### 第四步：部署

1. 点击 "Deploy" 按钮
2. 等待构建完成（通常 1-3 分钟）
3. 构建成功后，Vercel 会提供：
   - 生产环境 URL：`your-project.vercel.app`
   - 部署日志和状态

### 第五步：验证部署

1. **访问部署的网站**
   - 打开 Vercel 提供的 URL
   - 检查页面是否正常加载

2. **测试功能**
   - 发送一条测试消息
   - 检查是否收到 AI 回复
   - 查看浏览器控制台是否有错误

3. **检查日志**
   - 在 Vercel Dashboard → Deployments → 选择部署 → Functions
   - 查看 API 路由的执行日志

## 常见问题排查

### 问题1：构建失败

**症状**：部署时显示构建错误

**解决方案**：
- 检查 `package.json` 中的依赖是否正确
- 查看构建日志中的具体错误信息
- 确保 Node.js 版本兼容（Vercel 默认使用 Node.js 18.x）

### 问题2：API 超时

**症状**：聊天功能无响应或返回 504 错误

**原因**：
- Vercel 免费计划函数超时限制为 10 秒
- AI API 响应时间可能超过限制

**解决方案**：
1. **升级到 Vercel Pro**（推荐）
   - 超时时间延长至 60 秒
   - 已在本项目的 `vercel.json` 中配置

2. **优化 API 调用**
   - 减少 `max_tokens` 参数
   - 使用流式响应（stream）
   - 添加请求超时处理

### 问题3：环境变量未生效

**症状**：API 调用失败，提示 API Key 未配置

**解决方案**：
- 确认环境变量名称拼写正确（区分大小写）
- 检查是否选择了正确的环境（Production/Preview/Development）
- 重新部署项目以应用新的环境变量

### 问题4：CORS 错误

**症状**：浏览器控制台显示 CORS 相关错误

**解决方案**：
- Next.js API Routes 默认支持 CORS
- 如果仍有问题，检查 `next.config.js` 配置

## 持续部署

Vercel 支持自动部署：

- **生产环境**：推送到 `main`/`master` 分支时自动部署
- **预览环境**：推送到其他分支时创建预览部署
- **Pull Request**：为每个 PR 创建独立的预览部署

## 自定义域名

1. 在 Vercel Dashboard → Settings → Domains
2. 添加你的域名
3. 按照提示配置 DNS 记录
4. 等待 DNS 生效（通常几分钟到几小时）

## 性能优化建议

1. **使用 Edge Functions**（如果适用）
   - 将 API 路由迁移到 Edge Runtime
   - 减少冷启动时间

2. **启用缓存**
   - 在 `next.config.js` 中配置缓存策略
   - 使用 Vercel 的 Edge Caching

3. **监控和分析**
   - 使用 Vercel Analytics（Pro 功能）
   - 监控 API 响应时间和错误率

## 安全建议

1. **保护 API 密钥**
   - ✅ 使用环境变量存储敏感信息
   - ✅ 不要将 `.env` 文件提交到 Git
   - ✅ 定期轮换 API 密钥

2. **限制 API 访问**
   - 在 DeepSeek 控制台设置 API 使用限制
   - 监控异常使用情况

3. **添加速率限制**
   - 考虑在 API 路由中添加速率限制
   - 防止滥用

## 参考资源

- [Vercel 文档](https://vercel.com/docs)
- [Next.js 部署文档](https://nextjs.org/docs/deployment)
- [Vercel 环境变量](https://vercel.com/docs/concepts/projects/environment-variables)

## 获取帮助

如果遇到问题：
1. 查看 Vercel Dashboard 中的部署日志
2. 检查 [Vercel 社区论坛](https://github.com/vercel/vercel/discussions)
3. 查看项目 Issues

---

**部署成功后，你的应用将在 `https://your-project.vercel.app` 可用！** 🎉
