/**
 * 🧪 完整分流测试脚本 - Full Route Testing Script
 * 
 * 测试心理咨询系统的所有分流场景:
 *   1. 🆘 Crisis - 危机干预
 *   2. 📋 Assessment - 心理评估
 *   3. 🤝 Support - 情感支持
 *   4. 🎴 Action Cards - 技能卡片
 * 
 * 运行方式:
 *   npx ts-node --project tsconfig.scripts.json scripts/test-routing.ts
 */

require('dotenv').config({ path: '.env.local' });

import { quickCrisisKeywordCheck } from '../lib/ai/crisis-classifier';
import { coordinateAgents } from '../lib/ai/agents/orchestrator';
import { ChatMessage } from '../lib/ai/deepseek';

console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                🌳 心理树洞 - 完整分流测试脚本                         ║
╠══════════════════════════════════════════════════════════════════════╣
║  分流优先级:                                                         ║
║  1. 🆘 Crisis     - 危机干预（最高优先级）                            ║
║  2. 📋 Assessment - 心理评估（负面情绪/求助）                         ║
║  3. 🎴 Action Cards - 技能卡片（用户请求练习）                        ║
║  4. 🤝 Support    - 情感支持（积极/中性/倾诉需求）                    ║
╚══════════════════════════════════════════════════════════════════════╝
`);

// ============================================================================
// 测试用例定义
// ============================================================================

interface TestCase {
    name: string;
    category: 'crisis' | 'assessment' | 'support' | 'action_card';
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    expectedRoute: 'crisis' | 'assessment' | 'support';
    description: string;
}

const testCases: TestCase[] = [
    // ============================
    // 🆘 Crisis 场景
    // ============================
    {
        name: '危机 - 自杀关键词',
        category: 'crisis',
        message: '我不想活了，太痛苦了',
        expectedRoute: 'crisis',
        description: '包含自杀关键词，应立即进入危机干预',
    },
    {
        name: '危机 - 自伤意图',
        category: 'crisis',
        message: '我想伤害自己，割腕',
        expectedRoute: 'crisis',
        description: '包含自伤关键词，应触发危机响应',
    },
    {
        name: '危机 - 绝望表达',
        category: 'crisis',
        message: '活着没有意义，我已经计划好了',
        expectedRoute: 'crisis',
        description: '表达绝望且有计划，高危状态',
    },

    // ============================
    // 📋 Assessment 场景
    // ============================
    {
        name: '评估 - 焦虑求助',
        category: 'assessment',
        message: '最近工作压力很大，焦虑得睡不着，怎么办',
        expectedRoute: 'assessment',
        description: '负面情绪 + 求助信号，进入评估流程',
    },
    {
        name: '评估 - 抑郁症状',
        category: 'assessment',
        message: '这段时间心情很低落，对什么都提不起兴趣',
        expectedRoute: 'assessment',
        description: '抑郁症状描述，需要评估',
    },
    {
        name: '评估 - 人际困扰',
        category: 'assessment',
        message: '和同事关系很差，每天上班都很痛苦，需要帮助',
        expectedRoute: 'assessment',
        description: '困扰描述 + 帮助请求',
    },

    // ============================
    // 🤝 Support 场景
    // ============================
    {
        name: '支持 - 积极分享',
        category: 'support',
        message: '今天心情很好，工作终于完成了！',
        expectedRoute: 'support',
        description: '积极情绪表达，支持性回应',
    },
    {
        name: '支持 - 只想倾诉',
        category: 'support',
        message: '我只想说说心里话，不需要分析',
        expectedRoute: 'support',
        description: '明确表示只想倾诉，不要评估',
    },
    {
        name: '支持 - 日常聊天',
        category: 'support',
        message: '周末去爬山了，风景很美',
        expectedRoute: 'support',
        description: '中性日常分享',
    },

    // ============================
    // 🎴 Action Card 场景
    // ============================
    {
        name: '卡片 - 呼吸练习请求',
        category: 'action_card',
        message: '我想做呼吸练习，帮我放松一下',
        expectedRoute: 'support', // 实际路由是 support，但会附带 actionCards
        description: '请求具体技能练习，应返回呼吸卡片',
    },
    {
        name: '卡片 - 冥想请求',
        category: 'action_card',
        message: '能教我冥想吗？我想试试正念练习',
        expectedRoute: 'support',
        description: '请求冥想/正念，应返回冥想卡片',
    },
    {
        name: '卡片 - 放松技巧',
        category: 'action_card',
        message: '有什么缓解焦虑的放松方法吗？',
        expectedRoute: 'support',
        description: '请求放松技巧，应返回技能卡片',
    },
];

// ============================================================================
// 测试函数
// ============================================================================

/**
 * 模拟 API 中的意图分类逻辑
 */
function classifyIntent(
    message: string,
    safetyLabel: string
): { isCrisis: boolean; isSupportPositive: boolean; isSupportVenting: boolean; shouldAssessment: boolean; wantsSkillCard: boolean } {
    const msg = message.toLowerCase().trim();

    // 1. Crisis Check
    if (safetyLabel === 'crisis') {
        return { isCrisis: true, isSupportPositive: false, isSupportVenting: false, shouldAssessment: false, wantsSkillCard: false };
    }

    // Keyword backup
    if (quickCrisisKeywordCheck(msg)) {
        return { isCrisis: true, isSupportPositive: false, isSupportVenting: false, shouldAssessment: false, wantsSkillCard: false };
    }

    // 2. Skill Card Check
    const skillKeywords = /呼吸练习|放松技巧|放松方法|做个练习|想试试|缓解焦虑|学习放松|冥想|正念|着陆技术/i;
    const wantsSkillCard = skillKeywords.test(message);

    // 3. Venting Check
    const ventingKeywords = ['只想倾诉', '不要建议', '不要分析', '不需要建议', '不需要分析', '只要倾诉', '只想说说'];
    const isSupportVenting = ventingKeywords.some(k => msg.includes(k));

    // 4. Positive Check
    const positiveKeywords = ['开心', '高兴', '太好了', '顺利', '成功', '放松', '轻松', '幸福', '满足', '激动', '兴奋', '好消息'];
    const negativeKeywords = ['压力', '焦虑', '抑郁', '难受', '崩溃', '睡不着', '失眠', '烦', '痛苦', '困扰', '问题', '困难', '担心', '害怕'];

    const hasPositive = positiveKeywords.some(k => msg.includes(k));
    const hasNegative = negativeKeywords.some(k => msg.includes(k));
    const hasContrast = /但是|不过|虽然|尽管|可是/.test(msg);
    const hasHelpRequest = /帮帮我|求助|需要建议|需要方法|怎么办|如何解决|需要帮助/.test(msg);

    const isSupportPositive = hasPositive && !hasNegative && !hasContrast && !hasHelpRequest;

    // 5. Assessment Check
    const shouldAssessment = (hasNegative || hasHelpRequest) && !isSupportVenting;

    return { isCrisis: false, isSupportPositive, isSupportVenting, shouldAssessment, wantsSkillCard };
}

function determineRoute(intent: ReturnType<typeof classifyIntent>): 'crisis' | 'assessment' | 'support' {
    if (intent.isCrisis) return 'crisis';
    if (intent.wantsSkillCard) return 'support'; // Action cards go through support route
    if (intent.isSupportPositive || intent.isSupportVenting) return 'support';
    if (intent.shouldAssessment) return 'assessment';
    return 'support';
}

async function runTest(testCase: TestCase, index: number): Promise<{ passed: boolean; details: string }> {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`测试 ${index + 1}/${testCases.length}: ${testCase.name}`);
    console.log(`描述: ${testCase.description}`);
    console.log(`消息: "${testCase.message}"`);
    console.log('─'.repeat(70));

    try {
        const startTime = Date.now();

        // 1. Run Safety Observer (via orchestrator)
        const history: ChatMessage[] = (testCase.history || []).map(m => ({ role: m.role, content: m.content }));
        const orchestration = await coordinateAgents(testCase.message, history, {});

        const duration = Date.now() - startTime;
        console.log(`⏱️  耗时: ${duration}ms`);

        // 2. Classify Intent
        const intent = classifyIntent(testCase.message, orchestration.safety.label);
        const actualRoute = determineRoute(intent);

        // 3. Display Results
        console.log(`\n📊 分类结果:`);
        console.log(`   Safety Label: ${orchestration.safety.label} (score: ${orchestration.safety.score})`);
        console.log(`   isCrisis: ${intent.isCrisis}`);
        console.log(`   isSupportPositive: ${intent.isSupportPositive}`);
        console.log(`   isSupportVenting: ${intent.isSupportVenting}`);
        console.log(`   shouldAssessment: ${intent.shouldAssessment}`);
        console.log(`   wantsSkillCard: ${intent.wantsSkillCard}`);

        console.log(`\n🎯 路由结果:`);
        console.log(`   期望: ${testCase.expectedRoute}`);
        console.log(`   实际: ${actualRoute}`);

        const passed = actualRoute === testCase.expectedRoute;
        const symbol = passed ? '✅' : '❌';
        console.log(`\n${symbol} ${passed ? '测试通过' : '测试未通过'}`);

        return { passed, details: `${testCase.name}: ${symbol}` };

    } catch (error: any) {
        console.error(`\n❌ 测试失败:`, error.message);
        return { passed: false, details: `${testCase.name}: ❌ Error` };
    }
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
    console.log(`开始时间: ${new Date().toLocaleString()}\n`);

    const results: { category: string; passed: number; failed: number; details: string[] }[] = [
        { category: '🆘 Crisis', passed: 0, failed: 0, details: [] },
        { category: '📋 Assessment', passed: 0, failed: 0, details: [] },
        { category: '🤝 Support', passed: 0, failed: 0, details: [] },
        { category: '🎴 Action Cards', passed: 0, failed: 0, details: [] },
    ];

    const categoryMap: Record<string, number> = {
        'crisis': 0,
        'assessment': 1,
        'support': 2,
        'action_card': 3,
    };

    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const result = await runTest(testCase, i);
        const idx = categoryMap[testCase.category];

        if (result.passed) {
            results[idx].passed++;
        } else {
            results[idx].failed++;
        }
        results[idx].details.push(result.details);
    }

    // Summary
    console.log(`\n${'═'.repeat(70)}`);
    console.log('📈 测试汇总');
    console.log('═'.repeat(70));

    let totalPassed = 0;
    let totalFailed = 0;

    for (const r of results) {
        console.log(`\n${r.category}: ${r.passed}/${r.passed + r.failed} 通过`);
        for (const d of r.details) {
            console.log(`   ${d}`);
        }
        totalPassed += r.passed;
        totalFailed += r.failed;
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`总计: ${totalPassed}/${totalPassed + totalFailed} 通过`);
    console.log('═'.repeat(70));

    process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(console.error);
