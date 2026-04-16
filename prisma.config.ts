import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 配置
 *
 * 数据源 URL 从 schema.prisma 迁移到了这里，CLI（migrate / db pull）会读取。
 * 运行时 PrismaClient 通过 driver adapter（lib/db/prisma.ts 中的 PrismaPg）
 * 注入连接，不再依赖 schema 中的 datasource url。
 *
 * 对于 Neon pooled + unpooled 场景（原 directUrl），Prisma 7 推荐直接使用
 * 非 pooled URL 执行迁移，所以这里优先取 DATABASE_URL_UNPOOLED。
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
});
