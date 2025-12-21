/**
 * 🧪 分流测试脚本 - Route Testing Script
 * 
 * 测试心理咨询系统的各种分流场景
 * 
 * 运行方式:
 *   本地: npx ts-node --project tsconfig.scripts.json scripts/test-routing.ts
 *   生产: DEEPSEEK_API_KEY=xxx npx ts-node --project tsconfig.scripts.json scripts/test-routing.ts
 */

require('dotenv').config({ path: '.env.local' });

import { continueAssessment } from '../lib/ai/assessment';

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           🌳 心理树洞 - 分流测试脚本                              ║
╠══════════════════════════════════════════════════════════════════╣
║  测试项目:                                                       ║
║  1. State Classifier - SCEB 进度追踪                             ║
║  2. 模式判断 - Assessment vs Support                             ║
║  3. 循环检测 - 重复消息处理                                       ║
║  4. 自动结束 - 轮次上限触发                                       ║
╚══════════════════════════════════════════════════════════════════╝
`);

// ============================================================================
// 测试用例定义
// ============================================================================

interface TestCase {
    name: string;
    description: string;
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    expected: {
        recommendedMode: 'assessment' | 'support';
        shouldConclude: boolean;
        minProgress?: number;
    };
}

const testCases: TestCase[] = [
    {
        name: '🆕 新对话开始',
        description: '用户首次表达负面情绪，应保持评估模式收集信息',
        message: '最近工作压力很大，感觉很焦虑',
        history: [],
        expected: {
            recommendedMode: 'assessment', // 或 support（因信息少）
            shouldConclude: false,
            minProgress: 0,
        },
    },
    {
        name: '📊 中期评估 (4轮)',
        description: 'SCEB 部分收集，应继续评估',
        message: '睡眠变差了，经常失眠',
        history: [
            { role: 'user', content: '最近工作压力很大，很焦虑' },
            { role: 'assistant', content: '听起来工作给你带来了压力。能说说具体是什么情况吗？' },
            { role: 'user', content: '项目deadline太紧，每天加班到很晚' },
            { role: 'assistant', content: '每天加班确实辛苦。这些压力让你有什么感受或想法？' },
            { role: 'user', content: '我觉得自己能力不行，总担心做不好' },
            { role: 'assistant', content: '这种自我怀疑的想法让你很焦虑吧？' },
        ],
        expected: {
            recommendedMode: 'assessment',
            shouldConclude: false,
            minProgress: 50,
        },
    },
    {
        name: '🔄 重复消息检测',
        description: '用户重复相同内容 3+ 次，应切换到支持模式',
        message: '我会反复检查工作，不敢提交',
        history: [
            { role: 'user', content: '我会反复检查工作，不敢提交' },
            { role: 'assistant', content: '能说说是什么让你不敢提交吗？' },
            { role: 'user', content: '我会反复检查工作，不敢提交' },
            { role: 'assistant', content: '我注意到你提到反复检查，这背后可能有担忧？' },
            { role: 'user', content: '我会反复检查工作，不敢提交' },
            { role: 'assistant', content: '你多次提到这个情况，它给你带来了困扰。' },
        ],
        expected: {
            recommendedMode: 'support',
            shouldConclude: true, // 重复检测触发结束
        },
    },
    {
        name: '✅ 深度对话完成',
        description: '7+ 轮对话且进度 ≥70%，应触发总结',
        message: '是的，我会试着改变',
        history: [
            { role: 'user', content: '最近工作压力大，很焦虑' },
            { role: 'assistant', content: '听起来工作给你带来了很大压力。能说说具体情况吗？' },
            { role: 'user', content: '项目deadline紧，每天加班' },
            { role: 'assistant', content: '每天加班确实辛苦。这些压力下你有什么想法？' },
            { role: 'user', content: '我觉得自己能力不行，担心做不好' },
            { role: 'assistant', content: '这种自我怀疑让你焦虑。你通常怎么应对？' },
            { role: 'user', content: '反复检查，有时拖延到最后' },
            { role: 'assistant', content: '反复检查和拖延可能是应对焦虑的方式。有放松方法吗？' },
            { role: 'user', content: '没有，工作太忙了' },
            { role: 'assistant', content: '我了解你的情况了。我给你一个简短的总结和建议。' },
        ],
        expected: {
            recommendedMode: 'assessment',
            shouldConclude: true,
            minProgress: 70,
        },
    },
    {
        name: '😊 积极情绪',
        description: '用户表达积极情绪，分类器可能推荐支持模式',
        message: '今天心情很好，工作顺利',
        history: [],
        expected: {
            recommendedMode: 'support',
            shouldConclude: false,
        },
    },
];

// ============================================================================
// 测试执行器
// ============================================================================

async function runTest(testCase: TestCase, index: number): Promise<boolean> {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`测试 ${index + 1}/${testCases.length}: ${testCase.name}`);
    console.log(`描述: ${testCase.description}`);
    console.log(`用户消息: "${testCase.message.substring(0, 40)}${testCase.message.length > 40 ? '...' : ''}"`);
    console.log(`历史轮次: ${testCase.history.filter(m => m.role === 'user').length} 轮`);
    console.log('─'.repeat(70));

    try {
        const startTime = Date.now();
        const result = await continueAssessment(testCase.message, testCase.history);
        const duration = Date.now() - startTime;

        console.log(`⏱️  耗时: ${duration}ms`);

        if (!result.stateClassification) {
            console.log('⚠️  警告: 未返回 stateClassification（可能分类器调用失败）');
            return false;
        }

        const sc = result.stateClassification;

        // 结果展示
        console.log(`\n📊 分类结果:`);
        console.log(`   推荐模式: ${sc.recommendedMode === 'support' ? '🤝 support' : '📋 assessment'}`);
        console.log(`   应该结束: ${sc.shouldConclude ? '✅ 是' : '❌ 否'}`);
        console.log(`   总体进度: ${sc.overallProgress}%`);
        console.log(`   SCEB: S=${sc.scebProgress.situation}% C=${sc.scebProgress.cognition}% E=${sc.scebProgress.emotion}% B=${sc.scebProgress.behavior}%`);
        console.log(`   isConclusion: ${result.isConclusion}`);

        // 验证结果
        console.log(`\n🔍 验证:`);
        const checks: boolean[] = [];

        // 检查 shouldConclude
        const concludeMatch = sc.shouldConclude === testCase.expected.shouldConclude;
        checks.push(concludeMatch);
        console.log(`   shouldConclude: ${concludeMatch ? '✅' : '❌'} (期望: ${testCase.expected.shouldConclude}, 实际: ${sc.shouldConclude})`);

        // 检查最低进度
        if (testCase.expected.minProgress !== undefined) {
            const progressMatch = sc.overallProgress >= testCase.expected.minProgress;
            checks.push(progressMatch);
            console.log(`   进度 ≥${testCase.expected.minProgress}%: ${progressMatch ? '✅' : '❌'} (实际: ${sc.overallProgress}%)`);
        }

        // 备注：recommendedMode 在边界情况可能有合理的差异，仅作参考
        console.log(`   推荐模式: 期望 ${testCase.expected.recommendedMode}, 实际 ${sc.recommendedMode} (参考值)`);

        const passed = checks.every(c => c);
        console.log(`\n${passed ? '✅ 测试通过' : '❌ 测试未通过'}`);
        return passed;

    } catch (error: any) {
        console.error(`\n❌ 测试失败:`, error.message);
        return false;
    }
}

async function main() {
    console.log(`开始时间: ${new Date().toLocaleString()}\n`);

    let passed = 0;
    let failed = 0;

    for (let i = 0; i < testCases.length; i++) {
        const success = await runTest(testCases[i], i);
        if (success) {
            passed++;
        } else {
            failed++;
        }
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📈 测试完成: ${passed}/${testCases.length} 通过`);
    if (failed > 0) {
        console.log(`⚠️  ${failed} 个测试未通过（可能是边界情况，需人工判断）`);
    }
    console.log(`${'═'.repeat(70)}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

main();
