/**
 * sanitize.ts 单元测试
 * 测试 normalizeStepMetrics 和 ensureStepHasMetric 函数
 */

import { normalizeStepMetrics, ensureStepHasMetric, sanitizeActionCards, hasMetricToken } from './sanitize';
import { ActionCard } from '@/types/chat';

/**
 * 测试 hasMetricToken：指标识别（包括轮/组/遍/回）
 */
function testHasMetricToken() {
  console.log('\n🧪 测试 hasMetricToken: 指标识别（包括轮/组/遍/回）');
  console.log('='.repeat(80));

  const testCases = [
    {
      name: '重复3轮 → 应被识别为有指标',
      input: '重复3轮',
      expected: true,
    },
    {
      name: '重复3组 → 应被识别为有指标',
      input: '重复3组',
      expected: true,
    },
    {
      name: '重复2遍 → 应被识别为有指标',
      input: '重复2遍',
      expected: true,
    },
    {
      name: '重复2回 → 应被识别为有指标',
      input: '重复2回',
      expected: true,
    },
    {
      name: '写下3条担心×1次 → 应被识别为有指标',
      input: '写下3条担心×1次',
      expected: true,
    },
    {
      name: '闭眼数呼吸1分钟 → 应被识别为有指标',
      input: '闭眼数呼吸1分钟',
      expected: true,
    },
    {
      name: '记录感受 → 不应被识别为有指标',
      input: '记录感受',
      expected: false,
    },
  ];

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    const result = hasMetricToken(testCase.input);
    const passed = result === testCase.expected;
    
    if (passed) {
      console.log(`✅ ${testCase.name}`);
      console.log(`   输入: "${testCase.input}"`);
      console.log(`   输出: ${result}`);
      passCount++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   输入: "${testCase.input}"`);
      console.log(`   期望: ${testCase.expected}`);
      console.log(`   实际: ${result}`);
      failCount++;
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`📊 测试结果: ${passCount} 通过, ${failCount} 失败`);
  
  if (failCount === 0) {
    console.log('✅ 所有测试通过！');
  } else {
    console.log(`❌ ${failCount} 个测试失败`);
  }

  return failCount === 0;
}

/**
 * 测试 normalizeStepMetrics：处理重复指标和错位问题
 */
function testNormalizeStepMetrics() {
  console.log('\n🧪 测试 normalizeStepMetrics: 处理重复指标和错位问题');
  console.log('='.repeat(80));

  const testCases = [
    {
      name: '重复指标：写下3条担心×1次×1次',
      input: '写下3条担心×1次×1次',
      expected: '写下3条担心×1次',
    },
    {
      name: '重复指标：呼吸5次×2次×2次',
      input: '呼吸5次×2次×2次',
      expected: '呼吸5次×2次',
    },
    {
      name: '错位：写下3条×1次平静事×1次',
      input: '写下3条×1次平静事×1次',
      expected: '写下3条平静事×1次',
    },
    {
      name: '归一化：记录1次1分钟×1次 → 记录1分钟×1次',
      input: '记录1次1分钟×1次',
      expected: '记录1分钟×1次',
    },
    {
      name: '归一化：写下1次1秒×1次 → 写下1秒×1次',
      input: '写下1次1秒×1次',
      expected: '写下1秒×1次',
    },
    {
      name: '错位：标记1个×1次可行动项×1次',
      input: '标记1个×1次可行动项×1次',
      expected: '标记1个可行动项×1次',
    },
    {
      name: '正常：写下3条担心×1次（不应改变）',
      input: '写下3条担心×1次',
      expected: '写下3条担心×1次',
    },
    {
      name: '正常：闭眼数呼吸1分钟（不应改变）',
      input: '闭眼数呼吸1分钟',
      expected: '闭眼数呼吸1分钟',
    },
    {
      name: '中间错位：写下3条×1次具体担心×1次',
      input: '写下3条×1次具体担心×1次',
      expected: '写下3条具体担心×1次',
    },
    {
      name: '多个重复：写下3条×1次×1次×1次',
      input: '写下3条×1次×1次×1次',
      expected: '写下3条×1次',
    },
  ];

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    const result = normalizeStepMetrics(testCase.input);
    const passed = result === testCase.expected;
    
    if (passed) {
      console.log(`✅ ${testCase.name}`);
      console.log(`   输入: "${testCase.input}"`);
      console.log(`   输出: "${result}"`);
      passCount++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   输入: "${testCase.input}"`);
      console.log(`   期望: "${testCase.expected}"`);
      console.log(`   实际: "${result}"`);
      failCount++;
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`📊 测试结果: ${passCount} 通过, ${failCount} 失败`);
  
  if (failCount === 0) {
    console.log('✅ 所有测试通过！');
  } else {
    console.log(`❌ ${failCount} 个测试失败`);
  }

  return failCount === 0;
}

/**
 * 测试 ensureStepHasMetric：避免二次补齐
 */
function testEnsureStepHasMetric() {
  console.log('\n🧪 测试 ensureStepHasMetric: 避免二次补齐');
  console.log('='.repeat(80));

  const testCases = [
    {
      name: '已含时间：闭眼数呼吸1分钟 → 不追加',
      input: '闭眼数呼吸1分钟',
      expected: '闭眼数呼吸1分钟', // 不应追加
    },
    {
      name: '已含次数：深呼吸5次 → 不追加',
      input: '深呼吸5次',
      expected: '深呼吸5次', // 不应追加
    },
    {
      name: '已含×N次：写下3条担心×1次 → 不追加',
      input: '写下3条担心×1次',
      expected: '写下3条担心×1次', // 不应追加
    },
    {
      name: '已含组：呼吸4-6次×5组 → 不追加',
      input: '呼吸4-6次×5组',
      expected: '呼吸4-6次×5组', // 不应追加
    },
    {
      name: '已含轮：深呼吸3次×2轮 → 不追加',
      input: '深呼吸3次×2轮',
      expected: '深呼吸3次×2轮', // 不应追加
    },
    {
      name: '重复3轮：重复3轮 → 应被识别为有指标',
      input: '重复3轮',
      expected: '重复3轮', // 不应追加，因为"3轮"已经是有效指标
    },
    {
      name: '重复3组：重复3组 → 应被识别为有指标',
      input: '重复3组',
      expected: '重复3组', // 不应追加，因为"3组"已经是有效指标
    },
    {
      name: '重复2遍：重复2遍 → 应被识别为有指标',
      input: '重复2遍',
      expected: '重复2遍', // 不应追加，因为"2遍"已经是有效指标
    },
    {
      name: '重复2回：重复2回 → 应被识别为有指标',
      input: '重复2回',
      expected: '重复2回', // 不应追加，因为"2回"已经是有效指标
    },
    {
      name: '仅量词：写下3条担心 → 保留原样（不追加×1次）',
      input: '写下3条担心',
      expected: '写下3条担心', // 按门禁口径，量词已经是次数指标，不应追加
    },
    {
      name: '仅量词：标记1个可行动项 → 保留原样',
      input: '标记1个可行动项',
      expected: '标记1个可行动项', // 不应追加
    },
    {
      name: '缺少指标：记录感受 → 应补齐',
      input: '记录感受',
      expected: '记录感受×1次', // 或类似格式，应补齐
    },
    {
      name: '缺少指标：思考 → 应补齐',
      input: '思考',
      expected: '思考1分钟', // 或类似格式，应补齐
    },
  ];

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    const result = ensureStepHasMetric(testCase.input);
    
    // 对于"不应追加"的测试用例，检查结果是否等于输入
    // 对于"应补齐"的测试用例，检查结果是否包含指标
    let passed = false;
    if (testCase.expected === testCase.input) {
      // 不应追加的情况
      passed = result === testCase.input;
    } else {
      // 应补齐的情况：检查是否包含指标
      passed = hasMetricToken(result);
    }
    
    if (passed) {
      console.log(`✅ ${testCase.name}`);
      console.log(`   输入: "${testCase.input}"`);
      console.log(`   输出: "${result}"`);
      passCount++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   输入: "${testCase.input}"`);
      console.log(`   期望: "${testCase.expected}" (或包含指标)`);
      console.log(`   实际: "${result}"`);
      failCount++;
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`📊 测试结果: ${passCount} 通过, ${failCount} 失败`);
  
  if (failCount === 0) {
    console.log('✅ 所有测试通过！');
  } else {
    console.log(`❌ ${failCount} 个测试失败`);
  }

  return failCount === 0;
}

/**
 * 测试 sanitizeActionCards：完整流水线测试
 */
function testSanitizeActionCards() {
  console.log('\n🧪 测试 sanitizeActionCards: 完整流水线测试');
  console.log('='.repeat(80));

  const testCases = [
    {
      name: '重复指标：actionCards 中包含重复指标',
      input: [
        {
          title: '测试卡片',
          steps: ['写下3条担心×1次×1次', '闭眼数呼吸1分钟'],
          when: '',
          effort: 'low' as const,
        },
      ] as ActionCard[],
      expectedSteps: ['写下3条担心×1次', '闭眼数呼吸1分钟'],
    },
    {
      name: '错位：actionCards 中包含错位指标',
      input: [
        {
          title: '测试卡片',
          steps: ['写下3条×1次平静事×1次', '深呼吸5次'],
          when: '',
          effort: 'low' as const,
        },
      ] as ActionCard[],
      expectedSteps: ['写下3条平静事×1次', '深呼吸5次'],
    },
    {
      name: '混合：正常、重复、错位混合',
      input: [
        {
          title: '测试卡片',
          steps: [
            '写下3条担心×1次', // 正常
            '标记1个×1次可行动项×1次', // 错位（注意：映射表会将"标记1个"映射为"标记1项×1次"）
            '呼吸5次×2次×2次', // 重复
            '闭眼数呼吸1分钟', // 正常
          ],
          when: '',
          effort: 'low' as const,
        },
      ] as ActionCard[],
      expectedSteps: [
        '写下3条担心×1次',
        '标记1项可行动项×1次', // 注意：映射表的影响
        '呼吸5次×2次',
        '闭眼数呼吸1分钟',
      ],
    },
  ];

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    const result = sanitizeActionCards(testCase.input);
    const resultSteps = result[0]?.steps || [];
    
    let passed = true;
    if (resultSteps.length !== testCase.expectedSteps.length) {
      passed = false;
    } else {
      for (let i = 0; i < resultSteps.length; i++) {
        if (resultSteps[i] !== testCase.expectedSteps[i]) {
          passed = false;
          break;
        }
      }
    }
    
    if (passed) {
      console.log(`✅ ${testCase.name}`);
      console.log(`   输入 steps: ${JSON.stringify(testCase.input[0].steps)}`);
      console.log(`   输出 steps: ${JSON.stringify(resultSteps)}`);
      passCount++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   输入 steps: ${JSON.stringify(testCase.input[0].steps)}`);
      console.log(`   期望 steps: ${JSON.stringify(testCase.expectedSteps)}`);
      console.log(`   实际 steps: ${JSON.stringify(resultSteps)}`);
      failCount++;
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`📊 测试结果: ${passCount} 通过, ${failCount} 失败`);
  
  if (failCount === 0) {
    console.log('✅ 所有测试通过！');
  } else {
    console.log(`❌ ${failCount} 个测试失败`);
  }

  return failCount === 0;
}

// 运行测试
if (require.main === module) {
  console.log('🚀 开始运行 sanitize.ts 单元测试\n');
  
  const test0Passed = testHasMetricToken();
  const test1Passed = testNormalizeStepMetrics();
  const test2Passed = testEnsureStepHasMetric();
  const test3Passed = testSanitizeActionCards();
  
  console.log('\n' + '='.repeat(80));
  if (test0Passed && test1Passed && test2Passed && test3Passed) {
    console.log('✅ 所有测试套件通过！');
    process.exit(0);
  } else {
    console.log('❌ 部分测试套件失败');
    process.exit(1);
  }
}
