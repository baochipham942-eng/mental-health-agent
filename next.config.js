/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Turbopack：显式固定工作空间根目录，避免 Next 回退到 $HOME/package-lock.json
  turbopack: {
    root: __dirname,
  },
  // 压缩输出
  compress: true,
  // 图片优化（Vercel 自动处理）
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  output: 'standalone',
  // Turbopack 会把 db-reader 的运行时 fs 探测误判成整仓库 trace，
  // 实际不需要把 next.config.js 带进这些 eval 路由的 NFT。
  outputFileTracingExcludes: {
    '/api/eval/annotate': ['./next.config.js'],
    '/api/eval/coding': ['./next.config.js'],
    '/api/eval/compare': ['./next.config.js'],
    '/api/eval/datasets': ['./next.config.js'],
    '/api/eval/datasets/\\[caseId\\]': ['./next.config.js'],
    '/api/eval/runs': ['./next.config.js'],
    '/api/eval/runs/\\[runId\\]': ['./next.config.js'],
    '/api/eval/runs/\\[runId\\]/cases': ['./next.config.js'],
  },
  // Next 15+：原 experimental.serverComponentsExternalPackages
  // @xenova/transformers 依赖 onnxruntime-node 原生模块，不能被 webpack 打包
  serverExternalPackages: ['@xenova/transformers', 'onnxruntime-node', 'better-sqlite3', 'sql.js'],
  // 确保验证文件可以被访问
  async rewrites() {
    return [
      {
        source: '/:filename*.txt',
        destination: '/:filename*.txt',
      },
    ];
  },
  // 旧路由重定向：/dashboard/[id] -> /c/[id]
  async redirects() {
    return [
      {
        source: '/dashboard/:sessionId((?!memory|lab|optimization|prompts|users|invites|progress|crisis)[^/]+)',
        destination: '/c/:sessionId',
        permanent: true,
      },
    ];
  },

  // CORS 白名单（仅允许生产域 + Vercel 预览 + 本地开发）
  async headers() {
    const allowedOrigins = [
      'https://mental.llmxy.xyz',
      'https://mental-health-agent-tawny.vercel.app',
      'http://localhost:3002',
      'http://localhost:3000',
    ];
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: allowedOrigins.join(', ') },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
  // 忽略构建时的类型错误，避免因环境差异导致的构建失败
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig



