/**
 * Assessment Mode Switch 集成测试
 * 测试 continueAssessment 返回的 stateClassification 和模式切换逻辑
 * 
 * 运行: npx ts-node --project tsconfig.scripts.json scripts/test-mode-switch.ts
 */

require('dotenv').config({ path: '.env.local' });

import { continueAssessment } from '../lib/ai/assessment';

// 测试场景
const testCases = [
    {
        name: '正常评估开始（应保持 assessment）',
        message: '最近工作压力很大，感觉很累',
        history: [] as any[],
    },
    {
        name: '中期对话（应保持 assessment）',
        message: '大概两三个月了，睡眠也变差了',
        history: [
            { role: 'user' as const, content: '最近工作压力很大，感觉很累' },
            { role: 'assistant' as const, content: '听起来你最近承受了很多工作压力，感到疲惫。能具体说说是什么样的工作让你感到压力大吗？' },
            { role: 'user' as const, content: '主要是项目deadline太紧，每天都要加班到很晚' },
            { role: 'assistant' as const, content: '每天加班到很晚确实很辛苦。当你面对这些紧迫的deadline时，你通常会有什么想法？' },
            { role: 'user' as const, content: '我总觉得自己做得不够好，担心出错会被批评' },
            { role: 'assistant' as const, content: '你担心做得不够好、害怕被批评，这种想法一定让你感到很焦虑。' },
        ],
    },
    {
        name: '重复消息（应切换到 support）',
        message: '我会反复检查工作，不敢提交',
        history: [
            { role: 'user' as const, content: '我会反复检查工作，不敢提交' },
            { role: 'assistant' as const, content: '能具体说说是什么让你不敢提交吗？' },
            { role: 'user' as const, content: '我会反复检查工作，不敢提交' },
            { role: 'assistant' as const, content: '我注意到你提到反复检查，这背后可能有一些担忧？' },
            { role: 'user' as const, content: '我会反复检查工作，不敢提交' },
            { role: 'assistant' as const, content: '你多次提到这个情况，它似乎给你带来了很大困扰。' },
        ],
    },
    {
        name: '深度对话（可能触发 conclusion）',
        message: '是的，我会努力尝试的',
        history: [
            { role: 'user' as const, content: '最近工作压力很大，感觉焦虑' },
            { role: 'assistant' as const, content: '听起来你最近承受了很大的工作压力。能说说具体是什么情况吗？' },
            { role: 'user' as const, content: '项目deadline太紧，每天加班' },
            { role: 'assistant' as const, content: '每天加班确实辛苦。这种情况下你有什么想法？' },
            { role: 'user' as const, content: '我觉得自己能力不行，总是担心做错' },
            { role: 'assistant' as const, content: '这种自我怀疑让你很焦虑吧？你通常怎么应对？' },
            { role: 'user' as const, content: '我会反复检查，有时拖延到最后' },
            { role: 'assistant' as const, content: '反复检查和拖延可能是应对焦虑的方式。你平时有什么放松的方法吗？' },
            { role: 'user' as const, content: '没有，工作太忙了没时间' },
            { role: 'assistant' as const, content: '我了解到你面临的情境和感受。接下来我会给你一个简短的总结和建议。' },
        ],
    },
];

async function runTests() {
    console.log('🧪 Mode Switch 集成测试开始\n');
    console.log('='.repeat(70));

    for (const testCase of testCases) {
        console.log(`\n📋 测试场景: ${testCase.name}`);
        console.log('-'.repeat(50));
        console.log(`📝 用户消息: "${testCase.message.substring(0, 40)}..."`);
        console.log(`📜 历史轮次: ${testCase.history.filter(m => m.role === 'user').length} 轮`);

        try {
            const startTime = Date.now();
            const result = await continueAssessment(testCase.message, testCase.history);
            const duration = Date.now() - startTime;

            console.log(`\n⏱️  耗时: ${duration}ms`);
            console.log(`\n🎯 结果:`);
            console.log(`   - isConclusion: ${result.isConclusion ? '✅ 是（结束评估）' : '❌ 否'}`);
            console.log(`   - 有 AI 回复: ${result.reply ? '✅ 是' : '❌ 否（分类器提前结束）'}`);
            if (result.reply) {
                console.log(`   - 回复预览: "${result.reply.substring(0, 50)}..."`);
            }

            if (result.stateClassification) {
                const sc = result.stateClassification;
                console.log(`\n📊 State Classification:`);
                console.log(`   - 推荐模式: ${sc.recommendedMode === 'support' ? '🤝 support（情感支持）' : '📋 assessment（评估）'}`);
                console.log(`   - 应该结束: ${sc.shouldConclude ? '✅' : '❌'}`);
                console.log(`   - 总体进度: ${sc.overallProgress}%`);
                console.log(`   - SCEB: S=${sc.scebProgress.situation}% C=${sc.scebProgress.cognition}% E=${sc.scebProgress.emotion}% B=${sc.scebProgress.behavior}%`);
                console.log(`   - 理由: ${sc.reasoning}`);
            } else {
                console.log(`\n⚠️  未返回 stateClassification`);
            }
        } catch (error) {
            console.error(`\n❌ 测试失败:`, error);
        }

        console.log('\n' + '='.repeat(70));
    }

    console.log('\n✅ 测试完成!');
}

runTests().catch(console.error);
