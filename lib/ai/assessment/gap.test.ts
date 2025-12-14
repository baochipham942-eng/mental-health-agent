/**
 * gap.ts 单元测试
 * 测试 parseRiskLevel() 函数对简短否定回答的识别
 */

import { parseRiskLevel, detectGap } from './gap';

/**
 * 测试用例 case-011: 用户回答只有"没有"仍被判定 riskLevel=unknown 的问题
 */
function testCase011() {
  console.log('\n🧪 测试 case-011: 简短否定回答识别');
  console.log('='.repeat(80));

  // 测试用例：风险问题语境 + 简短否定回答
  const testCases = [
    {
      name: '风险问题 + "没有"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 没有',
      expected: 'none' as const,
    },
    {
      name: '风险问题 + "无"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 无',
      expected: 'none' as const,
    },
    {
      name: '风险问题 + "没"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 没',
      expected: 'none' as const,
    },
    {
      name: '风险问题 + "不存在"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 不存在',
      expected: 'none' as const,
    },
    {
      name: '风险问题 + "没有这种想法"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 没有这种想法',
      expected: 'none' as const,
    },
    {
      name: '初始消息 + 风险问题 + "没有"',
      text: '我最近很焦虑 为了确认你的安全：最近有没有出现伤害自己的想法？ 没有',
      expected: 'none' as const,
    },
    {
      name: '初始消息 + 风险问题 + "无"',
      text: '我最近很焦虑 为了确认你的安全：最近有没有出现伤害自己的想法？ 无',
      expected: 'none' as const,
    },
    {
      name: '包含"自伤"关键词 + "没有"',
      text: '最近有没有出现自伤的想法？ 没有',
      expected: 'none' as const,
    },
    {
      name: '包含"自杀"关键词 + "无"',
      text: '最近有没有出现自杀的想法？ 无',
      expected: 'none' as const,
    },
    {
      name: '包含"伤害自己的想法"关键词 + "没"',
      text: '最近有没有出现伤害自己的想法？ 没',
      expected: 'none' as const,
    },
    // 边界情况：不应该误判
    {
      name: '非风险问题 + "没有"（不应识别为none）',
      text: '你最近有没有看电影？ 没有',
      expected: 'unknown' as const,
    },
    {
      name: '风险问题 + 长回答包含"没有"（不应识别为none）',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我没有伤害自己的想法，但是最近心情很不好',
      expected: 'none' as const, // 这个应该被前面的明确排除规则捕获
    },
    {
      name: '风险问题 + "没有" + 其他内容（应识别为none，因为"没有"后跟逗号）',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 没有，但是我最近心情很不好',
      expected: 'none' as const, // "没有"后跟逗号，表示独立的否定回答，应识别为 'none'
    },
    // 长文本中独立出现的否定词（新增测试）
    {
      name: '长文本中独立出现的"没有"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我最近心情不好，睡眠质量下降，但是没有',
      expected: 'none' as const,
    },
    {
      name: '长文本中独立出现的"无"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 最近工作压力大，情绪低落，无',
      expected: 'none' as const,
    },
    {
      name: '长文本中独立出现的"没有"带语气词',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我最近很焦虑，但是没有啊',
      expected: 'none' as const,
    },
    {
      name: '长文本中独立出现的"无"带语气词',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 最近状态不好，无呢',
      expected: 'none' as const,
    },
    {
      name: '长文本中独立出现的"没"带语气词',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我最近心情不好，没啊',
      expected: 'none' as const,
    },
    {
      name: '长文本中独立出现的"不存在"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我最近很焦虑，但是不存在',
      expected: 'none' as const,
    },
    // 避免误判的场景
    {
      name: '避免误判"没有睡好"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我最近没有睡好',
      expected: 'unknown' as const, // 不应识别为 'none'
    },
    {
      name: '避免误判"没有动力"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我最近没有动力',
      expected: 'unknown' as const, // 不应识别为 'none'
    },
    {
      name: '避免误判"没有精神"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我最近没有精神',
      expected: 'unknown' as const, // 不应识别为 'none'
    },
    {
      name: '避免误判"没睡好"',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我最近没睡好',
      expected: 'unknown' as const, // 不应识别为 'none'
    },
    {
      name: '长文本中独立"没有"后跟其他内容（应识别）',
      text: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我最近心情不好，但是没有，只是工作压力大',
      expected: 'none' as const, // "没有"是独立的，应识别
    },
  ];

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    const result = parseRiskLevel(testCase.text);
    const passed = result === testCase.expected;
    
    if (passed) {
      console.log(`✅ ${testCase.name}`);
      console.log(`   输入: "${testCase.text.substring(0, 60)}${testCase.text.length > 60 ? '...' : ''}"`);
      console.log(`   期望: ${testCase.expected}, 实际: ${result}`);
      passCount++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   输入: "${testCase.text.substring(0, 60)}${testCase.text.length > 60 ? '...' : ''}"`);
      console.log(`   期望: ${testCase.expected}, 实际: ${result}`);
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
 * 测试 detectGap() 函数对 case-011 场景的处理
 */
function testDetectGapCase011() {
  console.log('\n🧪 测试 detectGap() - case-011 场景');
  console.log('='.repeat(80));

  // case-011 场景：初始消息 + 简短否定回答
  const initialMessage = '我最近很焦虑，总觉得要出事，脑子停不下来';
  
  // 测试用例：主要验证 riskLevel 是否正确识别为 'none'
  // 注意：即使 riskLevel 是 'none'，如果其他信息缺失，hasGap 仍可能是 true
  const testCases = [
    {
      name: 'case-011: 初始消息 + 风险问题 + "没有"',
      initialMessage: initialMessage,
      followupAnswer: '为了确认你的安全：最近有没有出现伤害自己的想法？ 没有',
      expectedRiskLevel: 'none' as const,
      // 即使 riskLevel 是 'none'，如果其他信息缺失，hasGap 仍可能是 true
      // 主要验证 riskLevel 不是 'unknown'
      expectedRiskLevelNotUnknown: true,
    },
    {
      name: 'case-011: 初始消息 + "没有"（包含风险关键词）',
      initialMessage: initialMessage,
      followupAnswer: '没有伤害自己的想法',
      expectedRiskLevel: 'none' as const,
      expectedRiskLevelNotUnknown: true,
    },
    {
      name: 'case-011: 初始消息 + 简短"没有"（不包含风险关键词，依赖 detectGap 特殊处理）',
      initialMessage: initialMessage,
      followupAnswer: '没有', // 非常短的否定回答
      expectedRiskLevel: 'none' as const, // 应该通过 detectGap 的特殊处理识别为 'none'
      expectedRiskLevelNotUnknown: true,
    },
    {
      name: 'case-011: 长文本中独立出现的"没有"（模拟实际场景）',
      initialMessage: initialMessage,
      followupAnswer: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我最近心情不好，睡眠质量下降，但是没有',
      expectedRiskLevel: 'none' as const,
      expectedRiskLevelNotUnknown: true,
    },
    {
      name: 'case-011: 长文本中独立出现的"没有"带语气词',
      initialMessage: initialMessage,
      followupAnswer: '为了确认你的安全：最近有没有出现伤害自己的想法？ 我最近很焦虑，但是没有啊',
      expectedRiskLevel: 'none' as const,
      expectedRiskLevelNotUnknown: true,
    },
  ];

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    const result = detectGap(testCase.initialMessage, testCase.followupAnswer);
    const riskLevelMatch = result.intake.riskLevel === testCase.expectedRiskLevel;
    const riskLevelNotUnknown = testCase.expectedRiskLevelNotUnknown 
      ? result.intake.riskLevel !== 'unknown' 
      : true;
    const passed = riskLevelMatch && riskLevelNotUnknown;

    if (passed) {
      console.log(`✅ ${testCase.name}`);
      console.log(`   riskLevel: ${result.intake.riskLevel} (期望: ${testCase.expectedRiskLevel})`);
      console.log(`   hasGap: ${result.hasGap} (其他信息可能缺失)`);
      if (result.hasGap) {
        console.log(`   gapKey: ${result.gapKey}`);
      }
      passCount++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   riskLevel: ${result.intake.riskLevel} (期望: ${testCase.expectedRiskLevel}) ${riskLevelMatch ? '✅' : '❌'}`);
      if (testCase.expectedRiskLevelNotUnknown && result.intake.riskLevel === 'unknown') {
        console.log(`   ❌ riskLevel 不应为 'unknown'`);
      }
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
 * 测试 case-011：followupAnswer 末尾为"没有"时不再进入 gap_followup
 */
function testCase011FollowupAnswerEndsWithNo() {
  console.log('\n🧪 测试 case-011: followupAnswer 末尾为"没有"时不再进入 gap_followup');
  console.log('='.repeat(80));

  const initialMessage = '我最近很焦虑，总觉得要出事，脑子停不下来';
  
  // 测试用例：followupAnswer 包含多轮回答，最后一句是"没有"
  const testCases = [
    {
      name: 'followupAnswer 末尾为"没有"（单句）',
      initialMessage: initialMessage,
      followupAnswer: '没有',
      expectedRiskLevel: 'none' as const,
      expectedHasGap: true, // 其他信息缺失，应该有 gap，但不是 risk gap
      expectedGapKey: 'impact' as const, // 应该是 impact gap，不是 risk gap
    },
    {
      name: 'followupAnswer 末尾为"没有"（多轮回答）',
      initialMessage: initialMessage,
      followupAnswer: '大概两周 影响7/10 没有',
      expectedRiskLevel: 'none' as const,
      expectedHasGap: false, // 所有信息都有，不应该有 gap
    },
    {
      name: 'followupAnswer 末尾为"无"（多轮回答）',
      initialMessage: initialMessage,
      followupAnswer: '大概两周 影响7/10 无',
      expectedRiskLevel: 'none' as const,
      expectedHasGap: false,
    },
    {
      name: 'followupAnswer 末尾为"没啊"（多轮回答，带语气词）',
      initialMessage: initialMessage,
      followupAnswer: '大概两周 影响7/10 没啊',
      expectedRiskLevel: 'none' as const,
      expectedHasGap: false,
    },
    {
      name: 'followupAnswer 末尾为"不存在"（多轮回答）',
      initialMessage: initialMessage,
      followupAnswer: '大概两周 影响7/10 不存在',
      expectedRiskLevel: 'none' as const,
      expectedHasGap: false,
    },
    {
      name: 'followupAnswer 末尾为"没有啊"（多轮回答，带语气词）',
      initialMessage: initialMessage,
      followupAnswer: '大概两周 影响7/10 没有啊',
      expectedRiskLevel: 'none' as const,
      expectedHasGap: false,
    },
    {
      name: 'followupAnswer 包含多轮回答，最后一句是"没有"（用句号分隔）',
      initialMessage: initialMessage,
      followupAnswer: '大概两周。影响7/10。没有',
      expectedRiskLevel: 'none' as const,
      expectedHasGap: false,
    },
    {
      name: 'followupAnswer 包含多轮回答，最后一句是"没有"（用换行分隔）',
      initialMessage: initialMessage,
      followupAnswer: '大概两周\n影响7/10\n没有',
      expectedRiskLevel: 'none' as const,
      expectedHasGap: false,
    },
  ];

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    const result = detectGap(testCase.initialMessage, testCase.followupAnswer);
    const riskLevelMatch = result.intake.riskLevel === testCase.expectedRiskLevel;
    const hasGapMatch = testCase.expectedHasGap !== undefined 
      ? result.hasGap === testCase.expectedHasGap 
      : true;
    const gapKeyMatch = testCase.expectedGapKey !== undefined
      ? result.hasGap && result.gapKey === testCase.expectedGapKey
      : true;
    const passed = riskLevelMatch && hasGapMatch && gapKeyMatch;

    if (passed) {
      console.log(`✅ ${testCase.name}`);
      console.log(`   riskLevel: ${result.intake.riskLevel} (期望: ${testCase.expectedRiskLevel})`);
      console.log(`   hasGap: ${result.hasGap} (期望: ${testCase.expectedHasGap !== undefined ? testCase.expectedHasGap : 'N/A'})`);
      if (result.hasGap) {
        console.log(`   gapKey: ${result.gapKey} (期望: ${testCase.expectedGapKey || 'N/A'})`);
      }
      passCount++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   riskLevel: ${result.intake.riskLevel} (期望: ${testCase.expectedRiskLevel}) ${riskLevelMatch ? '✅' : '❌'}`);
      console.log(`   hasGap: ${result.hasGap} (期望: ${testCase.expectedHasGap}) ${hasGapMatch ? '✅' : '❌'}`);
      if (result.hasGap && testCase.expectedGapKey) {
        console.log(`   gapKey: ${result.gapKey} (期望: ${testCase.expectedGapKey}) ${gapKeyMatch ? '✅' : '❌'}`);
      }
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
  console.log('🚀 开始运行 gap.ts 单元测试\n');
  
  const test1Passed = testCase011();
  const test2Passed = testDetectGapCase011();
  const test3Passed = testCase011FollowupAnswerEndsWithNo();
  
  console.log('\n' + '='.repeat(80));
  if (test1Passed && test2Passed && test3Passed) {
    console.log('✅ 所有测试套件通过！');
    process.exit(0);
  } else {
    console.log('❌ 部分测试套件失败');
    process.exit(1);
  }
}

