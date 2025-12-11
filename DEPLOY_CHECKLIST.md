# Vercel 部署检查清单

在部署到 Vercel 之前，请确认以下项目：

## ✅ 代码准备

- [ ] 代码已提交到 Git 仓库（GitHub/GitLab/Bitbucket）
- [ ] `.env` 文件已添加到 `.gitignore`（不会提交敏感信息）
- [ ] `package.json` 中包含正确的构建脚本
- [ ] 所有依赖都已添加到 `package.json`
- [ ] 代码在本地可以正常构建：`npm run build`

## ✅ 配置文件检查

- [ ] `vercel.json` 存在且配置正确
- [ ] `next.config.js` 存在且配置正确
- [ ] `tsconfig.json` 存在（TypeScript 项目）
- [ ] `.gitignore` 包含必要的忽略项

## ✅ 环境变量准备

准备以下环境变量的值：

- [ ] `DEEPSEEK_API_KEY` - DeepSeek API 密钥
- [ ] `DEEPSEEK_API_URL` - DeepSeek API 地址（可选，有默认值）

## ✅ Vercel 账户准备

- [ ] 已注册 Vercel 账户
- [ ] 已连接 GitHub/GitLab/Bitbucket 账户
- [ ] 已授权 Vercel 访问代码仓库

## ✅ 部署步骤

1. [ ] 在 Vercel Dashboard 中导入项目
2. [ ] 配置项目设置（框架、构建命令等）
3. [ ] 添加环境变量
4. [ ] 点击部署
5. [ ] 等待构建完成
6. [ ] 验证部署成功

## ✅ 部署后验证

- [ ] 网站可以正常访问
- [ ] 页面样式正确显示
- [ ] 聊天功能正常工作
- [ ] API 调用成功（检查浏览器控制台）
- [ ] 没有控制台错误
- [ ] 移动端显示正常（响应式设计）

## ⚠️ 常见问题预防

### API 超时问题
- [ ] 确认是否需要 Vercel Pro 计划（免费计划超时 10 秒）
- [ ] 已配置 `vercel.json` 中的 `maxDuration: 60`（需要 Pro 计划）

### 环境变量问题
- [ ] 环境变量名称拼写正确（区分大小写）
- [ ] 已为所有环境配置变量（Production、Preview、Development）

### 构建问题
- [ ] Node.js 版本兼容（Vercel 默认 18.x）
- [ ] 所有依赖都可以正常安装
- [ ] TypeScript 编译无错误

## 📝 部署后操作

- [ ] 测试所有核心功能
- [ ] 检查 Vercel Dashboard 中的日志
- [ ] 配置自定义域名（可选）
- [ ] 设置自动部署（默认已启用）
- [ ] 添加监控和分析（可选）

## 🆘 遇到问题？

1. 查看 Vercel Dashboard 中的部署日志
2. 检查浏览器控制台的错误信息
3. 参考 `VERCEL_DEPLOY.md` 中的故障排查部分
4. 查看 Vercel 官方文档

---

**完成所有检查项后，即可开始部署！** 🚀
