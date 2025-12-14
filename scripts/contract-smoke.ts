/**
 * Contract 回归用例
 * 验证 lib/skills/contract.ts 的契约验证函数是否正确工作
 */

import { validateActionCardsContract, validateNextStepsLinesContract } from '../lib/skills/contract';
import { ActionCard } from '../types/chat';

/**
 * 测试结果
 */
interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
}

/**
 * 测试 actionCards 契约验证
 */
function testActionCardsContract(): TestResult[] {
  const results: TestResult[] = [];

  // 测试 1: actionCards 数量=1（应 fail）
  const test1: ActionCard[] = [
    {
      title: '测试卡片',
      steps: ['步骤1×1次', '步骤2×1次', '步骤3×1次'],
      when: '测试时机',
      effort: 'low',
    },
  ];
  const result1 = validateActionCardsContract(test1);
  results.push({
    name: 'actionCards 数量=1（应 fail）',
    pass: !result1.pass && result1.errors.some(e => e.type === 'actionCards_count'),
    error: result1.pass ? '应该失败但没有失败' : undefined,
  });

  // 测试 2: actionCards 数量=3（应 fail）
  const test2: ActionCard[] = [
    {
      title: '测试卡片1',
      steps: ['步骤1×1次', '步骤2×1次', '步骤3×1次'],
      when: '测试时机',
      effort: 'low',
    },
    {
      title: '测试卡片2',
      steps: ['步骤1×1次', '步骤2×1次', '步骤3×1次'],
      when: '测试时机',
      effort: 'low',
    },
    {
      title: '测试卡片3',
      steps: ['步骤1×1次', '步骤2×1次', '步骤3×1次'],
      when: '测试时机',
      effort: 'low',
    },
  ];
  const result2 = validateActionCardsContract(test2);
  results.push({
    name: 'actionCards 数量=3（应 fail）',
    pass: !result2.pass && result2.errors.some(e => e.type === 'actionCards_count'),
    error: result2.pass ? '应该失败但没有失败' : undefined,
  });

  // 测试 3: steps 数量=2（应 fail）
  const test3: ActionCard[] = [
    {
      title: '测试卡片1',
      steps: ['步骤1×1次', '步骤2×1次'],
      when: '测试时机',
      effort: 'low',
    },
    {
      title: '测试卡片2',
      steps: ['步骤1×1次', '步骤2×1次', '步骤3×1次'],
      when: '测试时机',
      effort: 'low',
    },
  ];
  const result3 = validateActionCardsContract(test3);
  results.push({
    name: 'steps 数量=2（应 fail）',
    pass: !result3.pass && result3.errors.some(e => 
      e.type === 'steps_count' && e.location.includes('actionCards[0]')
    ),
    error: result3.pass ? '应该失败但没有失败' : undefined,
  });

  // 测试 4: steps 数量=6（应 fail）
  const test4: ActionCard[] = [
    {
      title: '测试卡片1',
      steps: ['步骤1×1次', '步骤2×1次', '步骤3×1次', '步骤4×1次', '步骤5×1次', '步骤6×1次'],
      when: '测试时机',
      effort: 'low',
    },
    {
      title: '测试卡片2',
      steps: ['步骤1×1次', '步骤2×1次', '步骤3×1次'],
      when: '测试时机',
      effort: 'low',
    },
  ];
  const result4 = validateActionCardsContract(test4);
  results.push({
    name: 'steps 数量=6（应 fail）',
    pass: !result4.pass && result4.errors.some(e => 
      e.type === 'steps_count' && e.location.includes('actionCards[0]')
    ),
    error: result4.pass ? '应该失败但没有失败' : undefined,
  });

  // 测试 5: step 超 16 汉字（应 fail）
  const test5: ActionCard[] = [
    {
      title: '测试卡片1',
      steps: [
        '这是一个非常长的步骤文本超过了十六个汉字的限制应该失败',
        '步骤2×1次',
        '步骤3×1次',
      ],
      when: '测试时机',
      effort: 'low',
    },
    {
      title: '测试卡片2',
      steps: ['步骤1×1次', '步骤2×1次', '步骤3×1次'],
      when: '测试时机',
      effort: 'low',
    },
  ];
  const result5 = validateActionCardsContract(test5);
  results.push({
    name: 'step 超 16 汉字（应 fail）',
    pass: !result5.pass && result5.errors.some(e => 
      e.type === 'step_length' && e.location.includes('actionCards[0].steps[0]')
    ),
    error: result5.pass ? '应该失败但没有失败' : undefined,
  });

  // 测试 6: step 缺少时长/次数/触发器（应 fail）
  const test6: ActionCard[] = [
    {
      title: '测试卡片1',
      steps: [
        '进行深呼吸练习',
        '步骤2×1次',
        '步骤3×1次',
      ],
      when: '测试时机',
      effort: 'low',
    },
    {
      title: '测试卡片2',
      steps: ['步骤1×1次', '步骤2×1次', '步骤3×1次'],
      when: '测试时机',
      effort: 'low',
    },
  ];
  const result6 = validateActionCardsContract(test6);
  results.push({
    name: 'step 缺少时长/次数/触发器（应 fail）',
    pass: !result6.pass && result6.errors.some(e => 
      e.type === 'step_metric' && e.location.includes('actionCards[0].steps[0]')
    ),
    error: result6.pass ? '应该失败但没有失败' : undefined,
  });

  // 测试 7: 正常情况（应 pass）
  const test7: ActionCard[] = [
    {
      title: '测试卡片1',
      steps: ['步骤1×1次', '步骤2×1次', '步骤3×1次'],
      when: '测试时机',
      effort: 'low',
    },
    {
      title: '测试卡片2',
      steps: ['步骤1×1次', '步骤2×1次', '步骤3×1次'],
      when: '测试时机',
      effort: 'low',
    },
  ];
  const result7 = validateActionCardsContract(test7);
  results.push({
    name: '正常情况（应 pass）',
    pass: result7.pass,
    error: !result7.pass ? `不应该失败但失败了: ${result7.errors.map(e => e.message).join(', ')}` : undefined,
  });

  return results;
}

/**
 * 测试 nextStepsLines 契约验证
 */
function testNextStepsLinesContract(): TestResult[] {
  const results: TestResult[] = [];

  // 测试 1: 缺触发器（应 fail）
  const test1 = [
    '进行呼吸练习5次，持续7天；完成标准：至少5次。',
    '写下3条担心×1次，持续观察3天；完成标准：至少记录2次。',
  ];
  const result1 = validateNextStepsLinesContract(test1);
  results.push({
    name: 'nextStepsLines 缺触发器（应 fail）',
    pass: !result1.pass && result1.errors.some(e => 
      e.type === 'nextSteps_format' && e.message.includes('缺少触发器')
    ),
    error: result1.pass ? '应该失败但没有失败' : undefined,
  });

  // 测试 2: 缺时长/次数（应 fail）
  const test2 = [
    '当焦虑情绪出现时，进行呼吸练习，持续观察；完成标准：至少5次。',
    '当需要时，写下担心，持续观察；完成标准：至少记录2次。',
  ];
  const result2 = validateNextStepsLinesContract(test2);
  results.push({
    name: 'nextStepsLines 缺时长/次数（应 fail）',
    pass: !result2.pass && result2.errors.some(e => 
      e.type === 'nextSteps_format' && e.message.includes('缺少时长或次数')
    ),
    error: result2.pass ? '应该失败但没有失败' : undefined,
  });

  // 测试 3: 缺完成标准（应 fail）
  const test3 = [
    '当焦虑情绪出现时，进行呼吸练习5次，持续7天。',
    '当需要时，写下3条担心×1次，持续观察3天。',
  ];
  const result3 = validateNextStepsLinesContract(test3);
  results.push({
    name: 'nextStepsLines 缺完成标准（应 fail）',
    pass: !result3.pass && result3.errors.some(e => 
      e.type === 'nextSteps_format' && e.message.includes('缺少完成标准')
    ),
    error: result3.pass ? '应该失败但没有失败' : undefined,
  });

  // 测试 4: 数量=1（应 fail）
  const test4 = [
    '当焦虑情绪出现时，进行呼吸练习5次，持续7天；完成标准：至少5次。',
  ];
  const result4 = validateNextStepsLinesContract(test4);
  results.push({
    name: 'nextStepsLines 数量=1（应 fail）',
    pass: !result4.pass && result4.errors.some(e => 
      e.type === 'nextSteps_count'
    ),
    error: result4.pass ? '应该失败但没有失败' : undefined,
  });

  // 测试 5: 数量=4（应 fail）
  const test4_2 = [
    '当焦虑情绪出现时，进行呼吸练习5次，持续7天；完成标准：至少5次。',
    '当需要时，写下3条担心×1次，持续观察3天；完成标准：至少记录2次。',
    '当需要时，进行正念冥想5分钟，持续1周；完成标准：至少4次。',
    '当需要时，进行身体觉察练习，持续观察；完成标准：至少3次。',
  ];
  const result4_2 = validateNextStepsLinesContract(test4_2);
  results.push({
    name: 'nextStepsLines 数量=4（应 fail）',
    pass: !result4_2.pass && result4_2.errors.some(e => 
      e.type === 'nextSteps_count'
    ),
    error: result4_2.pass ? '应该失败但没有失败' : undefined,
  });

  // 测试 6: 正常情况（应 pass）
  const test5 = [
    '当焦虑情绪出现时，进行呼吸练习5次，持续7天；完成标准：至少5次。',
    '当需要时，写下3条担心×1次，持续观察3天；完成标准：至少记录2次。',
  ];
  const result5 = validateNextStepsLinesContract(test5);
  results.push({
    name: 'nextStepsLines 正常情况（应 pass）',
    pass: result5.pass,
    error: !result5.pass ? `不应该失败但失败了: ${result5.errors.map(e => e.message).join(', ')}` : undefined,
  });

  // 测试 7: 正常情况（3条，应 pass）
  const test6 = [
    '当焦虑情绪出现时，进行呼吸练习5次，持续7天；完成标准：至少5次。',
    '当需要时，写下3条担心×1次，持续观察3天；完成标准：至少记录2次。',
    '当需要时，进行正念冥想5分钟，持续1周；完成标准：至少4次。',
  ];
  const result6 = validateNextStepsLinesContract(test6);
  results.push({
    name: 'nextStepsLines 正常情况（3条，应 pass）',
    pass: result6.pass,
    error: !result6.pass ? `不应该失败但失败了: ${result6.errors.map(e => e.message).join(', ')}` : undefined,
  });

  return results;
}

/**
 * 运行所有测试
 */
function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Contract 回归用例');
  console.log('='.repeat(80) + '\n');

  const actionCardsResults = testActionCardsContract();
  const nextStepsResults = testNextStepsLinesContract();

  const allResults = [...actionCardsResults, ...nextStepsResults];

  console.log('📊 测试结果:\n');

  let passCount = 0;
  let failCount = 0;

  allResults.forEach((result, idx) => {
    const status = result.pass ? '✅' : '❌';
    console.log(`${status} [${idx + 1}/${allResults.length}] ${result.name}`);
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
    if (result.pass) {
      passCount++;
    } else {
      failCount++;
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('📊 统计汇总');
  console.log('='.repeat(80));
  console.log(`总测试数: ${allResults.length}`);
  console.log(`通过: ${passCount} (${((passCount / allResults.length) * 100).toFixed(1)}%)`);
  console.log(`失败: ${failCount} (${((failCount / allResults.length) * 100).toFixed(1)}%)`);
  console.log('='.repeat(80) + '\n');

  if (failCount > 0) {
    console.log('❌ 部分测试失败\n');
    process.exit(1);
  } else {
    console.log('✅ 所有测试通过\n');
  }
}

// 运行测试
runTests();
