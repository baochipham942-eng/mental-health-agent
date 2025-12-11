/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 优化生产构建
  swcMinify: true,
  // 压缩输出
  compress: true,
  // 图片优化（Vercel 自动处理）
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // 确保 API 路由正确配置
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version' },
        ],
      },
    ];
  },
}

module.exports = nextConfig

