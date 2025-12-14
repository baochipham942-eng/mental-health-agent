/**
 * Contract 边界用例测试
 * 专门覆盖"完成标准(rightPart)数字误判为 metric"的历史坑，以及新增 metric 规则（\d+次、每次\d+分钟）
 */

import { validateNextStepsLinesContract } from '../lib/skills/contract';

/**
 * 测试结果
 */
interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
}

/**
 * 测试 nextStepsLines 边界用例
 */
function testNextStepsLinesEdgeCases(): TestResult[] {
  const results: TestResult[] = [];

  // 测试 1: 完成标准中有数字，但主句部分没有 metric（应 fail）
  // 这是历史 bug：之前会把"完成标准：至少5次"中的"5次"误判为 metric
  const test1 = [
    '当焦虑情绪出现时，进行呼吸练习，持续观察；完成标准：至少5次。',
    '当需要时，写下担心，持续观察；完成标准：至少记录2次。',
  ];
  const result1 = validateNextStepsLinesContract(test1);
  results.push({
    name: '完成标准有数字但主句缺 metric（应 fail）',
    pass: !result1.pass && result1.errors.some(e => 
      e.type === 'nextSteps_format' && e.message.includes('缺少时长或次数')
    ),
    error: result1.pass ? '应该失败但没有失败（可能误判了完成标准中的数字）' : undefined,
  });

  // 测试 2: 主句部分有 \d+次（应 pass）
  // 新增规则：支持"做3次""练习2次"等表达
  const test2 = [
    '当焦虑情绪出现时，进行呼吸练习3次，持续7天；完成标准：至少5次。',
    '当需要时，做放松练习2次，持续观察3天；完成标准：至少记录2次。',
  ];
  const result2 = validateNextStepsLinesContract(test2);
  results.push({
    name: '主句有 \\d+次 表达（应 pass）',
    pass: result2.pass,
    error: !result2.pass ? `不应该失败但失败了: ${result2.errors.map(e => e.message).join(', ')}` : undefined,
  });

  // 测试 3: 主句部分有 每次\d+分钟（应 pass）
  // 新增规则：支持"每次3分钟""每次10分钟"等表达
  const test3 = [
    '当焦虑情绪出现时，进行呼吸练习，每次3分钟，持续7天；完成标准：至少5次。',
    '当需要时，做正念冥想，每次10分钟，持续观察3天；完成标准：至少记录2次。',
  ];
  const result3 = validateNextStepsLinesContract(test3);
  results.push({
    name: '主句有 每次\\d+分钟 表达（应 pass）',
    pass: result3.pass,
    error: !result3.pass ? `不应该失败但失败了: ${result3.errors.map(e => e.message).join(', ')}` : undefined,
  });

  // 测试 4: 主句部分有 每次\d+小时（应 pass）
  const test4 = [
    '当焦虑情绪出现时，进行深度放松，每次1小时，持续7天；完成标准：至少5次。',
    '当需要时，做长时间冥想，每次2小时，持续观察3天；完成标准：至少记录2次。',
  ];
  const result4 = validateNextStepsLinesContract(test4);
  results.push({
    name: '主句有 每次\\d+小时 表达（应 pass）',
    pass: result4.pass,
    error: !result4.pass ? `不应该失败但失败了: ${result4.errors.map(e => e.message).join(', ')}` : undefined,
  });

  // 测试 5: 完成标准中有数字，主句部分也有 metric（应 pass）
  // 确保不会因为完成标准有数字而误判
  const test5 = [
    '当焦虑情绪出现时，进行呼吸练习5次，持续7天；完成标准：至少5次。',
    '当需要时，写下3条担心×1次，持续观察3天；完成标准：至少记录2次。',
  ];
  const result5 = validateNextStepsLinesContract(test5);
  results.push({
    name: '完成标准有数字且主句有 metric（应 pass）',
    pass: result5.pass,
    error: !result5.pass ? `不应该失败但失败了: ${result5.errors.map(e => e.message).join(', ')}` : undefined,
  });

  // 测试 6: 主句部分只有"持续观察"没有具体数字（应 fail）
  // 确保"持续观察"不被误判为 metric
  const test6 = [
    '当焦虑情绪出现时，进行呼吸练习，持续观察；完成标准：至少5次。',
    '当需要时，写下担心，持续观察；完成标准：至少记录2次。',
  ];
  const result6 = validateNextStepsLinesContract(test6);
  results.push({
    name: '主句只有"持续观察"无具体数字（应 fail）',
    pass: !result6.pass && result6.errors.some(e => 
      e.type === 'nextSteps_format' && e.message.includes('缺少时长或次数')
    ),
    error: result6.pass ? '应该失败但没有失败（"持续观察"不应被当作 metric）' : undefined,
  });

  // 测试 7: 主句部分有 \d+次 但完成标准也有数字（应 pass）
  // 确保只检查 leftPart，不会混淆
  const test7 = [
    '当焦虑情绪出现时，做放松练习3次，持续7天；完成标准：至少5次。',
    '当需要时，进行呼吸练习2次，持续观察3天；完成标准：至少记录2次。',
  ];
  const result7 = validateNextStepsLinesContract(test7);
  results.push({
    name: '主句有 \\d+次 且完成标准有数字（应 pass）',
    pass: result7.pass,
    error: !result7.pass ? `不应该失败但失败了: ${result7.errors.map(e => e.message).join(', ')}` : undefined,
  });

  // 测试 8: 主句部分有 每次\d+分钟 但完成标准也有数字（应 pass）
  const test8 = [
    '当焦虑情绪出现时，进行正念冥想，每次5分钟，持续7天；完成标准：至少5次。',
    '当需要时，做身体扫描，每次10分钟，持续观察3天；完成标准：至少记录2次。',
  ];
  const result8 = validateNextStepsLinesContract(test8);
  results.push({
    name: '主句有 每次\\d+分钟 且完成标准有数字（应 pass）',
    pass: result8.pass,
    error: !result8.pass ? `不应该失败但失败了: ${result8.errors.map(e => e.message).join(', ')}` : undefined,
  });

  // 测试 9: 使用英文分号和冒号的完成标准（应正确拆分）
  const test9 = [
    '当焦虑情绪出现时，进行呼吸练习，持续观察;完成标准:至少5次。',
    '当需要时，写下担心，持续观察;完成标准:至少记录2次。',
  ];
  const result9 = validateNextStepsLinesContract(test9);
  results.push({
    name: '英文分号冒号的完成标准（应 fail，主句缺 metric）',
    pass: !result9.pass && result9.errors.some(e => 
      e.type === 'nextSteps_format' && e.message.includes('缺少时长或次数')
    ),
    error: result9.pass ? '应该失败但没有失败（应正确拆分英文分号冒号）' : undefined,
  });

  // 测试 10: 主句部分有多种 metric 表达组合（应 pass）
  const test10 = [
    '当焦虑情绪出现时，做呼吸练习3次，每次5分钟，持续7天；完成标准：至少5次。',
    '当需要时，进行放松练习2次，每次10分钟，持续观察3天；完成标准：至少记录2次。',
  ];
  const result10 = validateNextStepsLinesContract(test10);
  results.push({
    name: '主句有多种 metric 表达组合（应 pass）',
    pass: result10.pass,
    error: !result10.pass ? `不应该失败但失败了: ${result10.errors.map(e => e.message).join(', ')}` : undefined,
  });

  return results;
}

/**
 * 运行所有测试
 */
function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Contract 边界用例测试');
  console.log('='.repeat(80) + '\n');

  const edgeResults = testNextStepsLinesEdgeCases();

  const allResults = [...edgeResults];

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
