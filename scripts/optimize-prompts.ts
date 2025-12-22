/**
 * Prompt 优化演示脚本
 * 
 * 使用方法：
 * npx ts-node --project tsconfig.scripts.json scripts/optimize-prompts.ts
 */

require('dotenv').config({ path: '.env.local' });

import { runPromptOptimization } from '../lib/actions/optimization';

async function main() {
    console.log('🔍 开始分析低分对话...\n');

    try {
        // 运行优化分析（分析过去 7 天）
        const { result, log } = await runPromptOptimization(7);

        console.log('📊 分析结果：');
        console.log(`- 低分对话数量: ${result.lowScoreCount}`);
        console.log(`- 优化日志 ID: ${log?.id}\n`);

        if (result.lowScoreCount === 0) {
            console.log('✅ 暂无低分对话，系统运行良好！');
            return;
        }

        console.log('⚠️  发现的常见问题：');
        console.log('法律问题:', result.commonIssues.legal);
        console.log('伦理问题:', result.commonIssues.ethical);
        console.log('专业性问题:', result.commonIssues.professional);
        console.log('用户体验问题:', result.commonIssues.ux);
        console.log('');

        console.log('💡 改进建议：');
        result.suggestions.forEach((suggestion, i) => {
            console.log(`${i + 1}. ${suggestion}`);
        });
        console.log('');

        console.log('📝 受影响的 Prompt 文件：');
        result.affectedPrompts.forEach(prompt => {
            console.log(`- ${prompt}`);
        });
        console.log('');

        console.log('⚡ 下一步：');
        console.log('1. 审核上述建议');
        console.log('2. 手动修改 lib/ai/prompts.ts');
        console.log('3. 测试验证效果');
        console.log('4. 标记日志为已应用：');
        console.log(`   UPDATE "PromptOptimizationLog" SET "appliedAt" = NOW(), "appliedBy" = 'your_name' WHERE "id" = '${log?.id}';`);

    } catch (error) {
        console.error('❌ 优化分析失败:', error);
        process.exit(1);
    }
}

main().catch(console.error);
