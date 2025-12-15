/**
 * Route Policy 回归用例
 * 验证路由判定逻辑（shouldEnterAssessment）是否正确工作
 * 
 * 测试覆盖：
 * - 正向闲聊不应进入 assessment / followup
 * - 困扰/受损/求助应进入 assessment
 * - stressor 单独不触发，需与 A/B/C 组合
 * - 边界情况处理
 */

import { shouldEnterAssessment } from '../lib/ai/assessment/question_policy';

/**
 * 测试用例
 */
interface TestCase {
  name: string;
  userText: string;
  emotion?: { label: string; score: number };
  expectedRoute: 'support' | 'assessment' | 'crisis';
  expectedAllowFollowup: boolean; // 是否允许进入 awaiting_followup
}

/**
 * 测试结果
 */
interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
}

/**
 * 测试用例列表
 */
const testCases: TestCase[] = [
  // 应走 support（不得进入 awaiting_followup）
  {
    name: '正向输入1 - 好开心呀，泡了温泉还吃了水果',
    userText: '我好开心呀，泡了温泉还吃了水果',
    expectedRoute: 'support',
    expectedAllowFollowup: false,
  },
  {
    name: '正向输入2 - 是呀是呀',
    userText: '是呀是呀',
    expectedRoute: 'support',
    expectedAllowFollowup: false,
  },
  {
    name: '正向输入3 - 对呀',
    userText: '对呀',
    expectedRoute: 'support',
    expectedAllowFollowup: false,
  },
  {
    name: '正向输入4 - 嗯嗯',
    userText: '嗯嗯',
    expectedRoute: 'support',
    expectedAllowFollowup: false,
  },
  {
    name: '正向输入5 - 今天不错，想跟你聊聊开心的事',
    userText: '今天不错，想跟你聊聊开心的事',
    expectedRoute: 'support',
    expectedAllowFollowup: false,
  },
  
  // 应走 assessment
  {
    name: '困扰输入1 - 最近工作压力很大，睡不好，脑子停不下来',
    userText: '最近工作压力很大，睡不好，脑子停不下来',
    expectedRoute: 'assessment',
    expectedAllowFollowup: true,
  },
  {
    name: '困扰输入2 - 被领导骂了，很委屈，一直内耗',
    userText: '被领导骂了，很委屈，一直内耗',
    expectedRoute: 'assessment',
    expectedAllowFollowup: true,
  },
  {
    name: '困扰输入3 - 加班太多，影响睡眠和效率，怎么办',
    userText: '加班太多，影响睡眠和效率，怎么办',
    expectedRoute: 'assessment',
    expectedAllowFollowup: true,
  },
  
  // 边界：stressor 单独不触发
  {
    name: '边界1 - 领导给的活太多了（只有stressor，无困扰/受损/求助）',
    userText: '领导给的活太多了',
    expectedRoute: 'support',
    expectedAllowFollowup: false,
  },
  
  // 风险策略不应乱入
  {
    name: '边界2 - 想辞职（单独出现，无困扰词）',
    userText: '想辞职',
    expectedRoute: 'support',
    expectedAllowFollowup: false,
  },
  {
    name: '边界3 - 想辞职 + 困扰（应触发assessment）',
    userText: '想辞职，压力很大，很焦虑',
    expectedRoute: 'assessment',
    expectedAllowFollowup: true,
  },
  {
    name: '边界4 - 我不想活了，已经想好怎么做（crisis，不应进入assessment）',
    userText: '我不想活了，已经想好怎么做',
    expectedRoute: 'crisis',
    expectedAllowFollowup: false,
  },
  
  // 情绪强度触发
  {
    name: '情绪触发1 - 高负面情绪强度（score >= 7）',
    userText: '我很难受',
    emotion: { label: '焦虑', score: 7 },
    expectedRoute: 'assessment',
    expectedAllowFollowup: true,
  },
  {
    name: '情绪触发2 - 低负面情绪强度（score < 7）',
    userText: '我有点担心',
    emotion: { label: '焦虑', score: 5 },
    expectedRoute: 'support',
    expectedAllowFollowup: false,
  },
  {
    name: '情绪触发3 - 正向情绪（不应触发）',
    userText: '我很开心',
    emotion: { label: '快乐', score: 8 },
    expectedRoute: 'support',
    expectedAllowFollowup: false,
  },
  
  // 功能受损触发
  {
    name: '功能受损1 - 影响睡眠',
    userText: '最近总是影响睡眠',
    expectedRoute: 'assessment',
    expectedAllowFollowup: true,
  },
  {
    name: '功能受损2 - 没精神',
    userText: '最近总是没精神',
    expectedRoute: 'assessment',
    expectedAllowFollowup: true,
  },
  
  // 求助意图触发
  {
    name: '求助意图1 - 怎么办',
    userText: '我最近很焦虑，怎么办',
    expectedRoute: 'assessment',
    expectedAllowFollowup: true,
  },
  {
    name: '求助意图2 - 帮帮我',
    userText: '帮帮我，我很难受',
    expectedRoute: 'assessment',
    expectedAllowFollowup: true,
  },
  
  // stressor + 困扰组合触发
  {
    name: 'stressor组合1 - 被领导骂 + 委屈',
    userText: '被领导骂了，很委屈',
    expectedRoute: 'assessment',
    expectedAllowFollowup: true,
  },
  {
    name: 'stressor组合2 - 加班 + 影响睡眠',
    userText: '加班太多，影响睡眠',
    expectedRoute: 'assessment',
    expectedAllowFollowup: true,
  },
];

/**
 * 运行所有测试
 */
function runAllTests(): void {
  console.log('开始运行 Route Policy 回归用例...\n');
  
  const results: TestResult[] = [];
  
  for (const testCase of testCases) {
    // 跳过 crisis 测试用例（crisis 检查在 determineRouteType 中，不在 shouldEnterAssessment 中）
    if (testCase.expectedRoute === 'crisis') {
      // crisis 用例：shouldEnterAssessment 应该返回 false（因为 crisis 优先级更高，不会进入 assessment）
      const shouldEnter = shouldEnterAssessment(testCase.userText, testCase.emotion);
      const pass = shouldEnter === false; // crisis 不应进入 assessment
      results.push({
        name: `${testCase.name} - shouldEnterAssessment (crisis不应进入assessment)`,
        pass,
        error: pass ? undefined : `crisis 用例：期望 shouldEnterAssessment=false，实际=${shouldEnter}`,
      });
      continue;
    }
    
    // 测试 shouldEnterAssessment
    const shouldEnter = shouldEnterAssessment(testCase.userText, testCase.emotion);
    const expectedShouldEnter = testCase.expectedRoute === 'assessment';
    
    // 验证 shouldEnterAssessment 结果
    const pass = shouldEnter === expectedShouldEnter;
    results.push({
      name: `${testCase.name} - shouldEnterAssessment`,
      pass,
      error: pass ? undefined : `期望 shouldEnterAssessment=${expectedShouldEnter}，实际=${shouldEnter}（期望路由=${testCase.expectedRoute}）`,
    });
  }
  
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);
  
  console.log(`\n测试结果：${passed}/${results.length} 通过\n`);
  
  if (failed.length > 0) {
    console.log('失败的测试：');
    failed.forEach(result => {
      console.log(`  ❌ ${result.name}`);
      if (result.error) {
        console.log(`     错误：${result.error}`);
      }
    });
    console.log('');
    process.exit(1);
  } else {
    console.log('✅ 所有测试通过！\n');
    process.exit(0);
  }
}

// 运行测试
runAllTests();
