/**
 * State Classifier 命令行测试脚本
 * 
 * 运行方式: npx ts-node --project tsconfig.scripts.json scripts/test-state-classifier.ts
 */

// Load env vars
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: '.env.local' });

import { classifyDialogueState } from '../lib/ai/agents/state-classifier';
import { ChatMessage } from '../lib/ai/deepseek';

// 模拟不同阶段的对话场景
const testCases = [
    {
        name: '早期对话（2轮）',
        history: [
            { role: 'user', content: '最近工作压力很大，感觉很累' },
            { role: 'assistant', content: '听起来你最近承受了很多工作压力，感到疲惫。能具体说说是什么样的工作让你感到压力大吗？' },
            { role: 'user', content: '主要是项目deadline太紧，每天都要加班' },
        ] as ChatMessage[],
    },
    {
        name: '中期对话（5轮，SCEB部分收集）',
        history: [
            { role: 'user', content: '最近工作压力很大，感觉很累' },
            { role: 'assistant', content: '听起来你最近承受了很多工作压力，感到疲惫。能具体说说是什么样的工作让你感到压力大吗？' },
            { role: 'user', content: '主要是项目deadline太紧，每天都要加班到很晚' },
            { role: 'assistant', content: '每天加班到很晚确实很辛苦。当你面对这些紧迫的deadline时，你通常会有什么想法？' },
            { role: 'user', content: '我总觉得自己做得不够好，担心出错会被批评' },
            { role: 'assistant', content: '你担心做得不够好、害怕被批评，这种想法一定让你感到很焦虑。当你有这些担忧时，你通常会怎么应对呢？' },
            { role: 'user', content: '我会反复检查工作，不敢提交，有时候会拖延到最后一刻' },
            { role: 'assistant', content: '反复检查和拖延可能是你应对焦虑的方式。这样的情况持续多久了？对你的生活有什么影响吗？' },
            { role: 'user', content: '大概两三个月了，睡眠也变差了，经常失眠' },
        ] as ChatMessage[],
    },
    {
        name: '重复相同消息（循环场景）',
        history: [
            { role: 'user', content: '我会反复检查工作，不敢提交' },
            { role: 'assistant', content: '能具体说说是什么让你不敢提交吗？' },
            { role: 'user', content: '我会反复检查工作，不敢提交' },
            { role: 'assistant', content: '我注意到你提到反复检查，这背后可能有一些担忧？' },
            { role: 'user', content: '我会反复检查工作，不敢提交' },
            { role: 'assistant', content: '你多次提到这个情况，它似乎给你带来了很大困扰。' },
            { role: 'user', content: '我会反复检查工作，不敢提交' },
        ] as ChatMessage[],
    },
];

async function runTests() {
    console.log('🧪 State Classifier 测试开始\n');
    console.log('='.repeat(60));

    for (const testCase of testCases) {
        console.log(`\n📋 测试场景: ${testCase.name}`);
        console.log('-'.repeat(40));

        try {
            const startTime = Date.now();
            const result = await classifyDialogueState(testCase.history);
            const duration = Date.now() - startTime;

            console.log(`⏱️  耗时: ${duration}ms`);
            console.log(`\n📊 SCEB 进度:`);
            console.log(`   - 情境 (S): ${result.scebProgress.situation}%`);
            console.log(`   - 认知 (C): ${result.scebProgress.cognition}%`);
            console.log(`   - 情绪 (E): ${result.scebProgress.emotion}%`);
            console.log(`   - 行为 (B): ${result.scebProgress.behavior}%`);
            console.log(`   - 总体进度: ${result.overallProgress}%`);
            console.log(`\n🎯 判断结果:`);
            console.log(`   - 应该结束评估: ${result.shouldConclude ? '✅ 是' : '❌ 否'}`);
            console.log(`   - 推荐模式: ${result.recommendedMode}`);
            console.log(`   - 判断理由: ${result.reasoning}`);
            if (result.missingElements.length > 0) {
                console.log(`   - 缺失要素: ${result.missingElements.join('、')}`);
            }
        } catch (error) {
            console.error(`❌ 测试失败:`, error);
        }

        console.log('\n' + '='.repeat(60));
    }

    console.log('\n✅ 测试完成!');
}

runTests().catch(console.error);
