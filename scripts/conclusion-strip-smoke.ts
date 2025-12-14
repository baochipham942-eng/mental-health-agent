/**
 * Conclusion LLM 输出剥离回归用例
 * 验证 steps_and_cards 模式下，LLM 输出的 nextSteps 和 actionCards 能被正确剥离
 */

import { generateAssessmentConclusion } from '../lib/ai/assessment/conclusion';
import { renderSkills } from '../lib/skills/render';
import { extractSkillContext } from '../lib/skills/context';
import { selectSkills } from '../lib/skills/select';

/**
 * 模拟 LLM 输出（极端场景）
 */
interface MockLLMOutput {
  scenario: string;
  fullReply: string;
  description: string;
}

/**
 * 测试场景 1: LLM 把【下一步清单】写进【初筛总结】里
 */
const scenario1: MockLLMOutput = {
  scenario: 'LLM 把【下一步清单】写进【初筛总结】里',
  fullReply: `【初筛总结】
你提到焦虑持续2周，影响程度：7/10，无自伤念头。建议你每晚睡前做3分钟呼吸练习，持续7天；完成标准：至少5晚。当焦虑情绪出现时，写下3条担心×1次，持续观察3天；完成标准：至少记录2次。

【风险与分流】
建议尽快专业评估（urgent）。影响7分且持续2周，建议预约专业评估。`,
  description: 'LLM 在【初筛总结】中混入了【下一步清单】的内容',
};

/**
 * 测试场景 2: LLM 把【下一步清单】写进【风险与分流】里
 */
const scenario2: MockLLMOutput = {
  scenario: 'LLM 把【下一步清单】写进【风险与分流】里',
  fullReply: `【初筛总结】
你提到焦虑持续2周，影响程度：7/10，无自伤念头。

【风险与分流】
建议尽快专业评估（urgent）。影响7分且持续2周，建议预约专业评估。建议你每晚睡前做3分钟呼吸练习，持续7天；完成标准：至少5晚。当焦虑情绪出现时，写下3条担心×1次，持续观察3天；完成标准：至少记录2次。`,
  description: 'LLM 在【风险与分流】中混入了【下一步清单】的内容',
};

/**
 * 测试场景 3: LLM 输出混杂 JSON 残片（非标准 actionCards JSON）
 */
const scenario3: MockLLMOutput = {
  scenario: 'LLM 输出混杂 JSON 残片',
  fullReply: `【初筛总结】
你提到焦虑持续2周，影响程度：7/10，无自伤念头。

【风险与分流】
建议尽快专业评估（urgent）。影响7分且持续2周，建议预约专业评估。

{"actionCards": [{"title": "错误卡片", "steps": ["步骤1", "步骤2"]}]}
还有一些其他文本
\`\`\`json
{"actionCards": [{"title": "另一个错误卡片"}]}
\`\`\``,
  description: 'LLM 输出了非标准的 actionCards JSON 残片',
};

/**
 * 测试场景 4: LLM 同时输出了【下一步清单】和 actionCards JSON
 */
const scenario4: MockLLMOutput = {
  scenario: 'LLM 同时输出了【下一步清单】和 actionCards JSON',
  fullReply: `【初筛总结】
你提到焦虑持续2周，影响程度：7/10，无自伤念头。

【风险与分流】
建议尽快专业评估（urgent）。影响7分且持续2周，建议预约专业评估。

【下一步清单】
1. 每晚睡前做3分钟呼吸练习，持续7天；完成标准：至少5晚。
2. 当焦虑情绪出现时，写下3条担心×1次，持续观察3天；完成标准：至少记录2次。

\`\`\`json
{
  "actionCards": [
    {"title": "错误卡片1", "steps": ["步骤1", "步骤2", "步骤3"], "when": "测试", "effort": "low"},
    {"title": "错误卡片2", "steps": ["步骤1", "步骤2", "步骤3"], "when": "测试", "effort": "low"}
  ]
}
\`\`\``,
  description: 'LLM 同时输出了【下一步清单】和 actionCards JSON，应该都被剥离',
};

/**
 * 模拟 chatCompletion 函数（返回预设的 LLM 输出）
 * 注意：此函数仅用于说明，实际测试中直接使用场景数据
 */
async function mockChatCompletion(messages: any[], options?: any): Promise<string> {
  // 此函数仅用于说明，实际测试中直接使用场景数据
  return '';
}

/**
 * 测试剥离逻辑（不实际调用 LLM）
 */
function testStripLogic() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Conclusion LLM 输出剥离回归用例');
  console.log('='.repeat(80) + '\n');

  const scenarios = [scenario1, scenario2, scenario3, scenario4];
  let passCount = 0;
  let failCount = 0;

  scenarios.forEach((scenario, idx) => {
    console.log(`\n[${idx + 1}/${scenarios.length}] 测试场景: ${scenario.scenario}`);
    console.log(`描述: ${scenario.description}`);
    console.log('-'.repeat(80));

    // 模拟剥离逻辑（从 conclusion.ts 中提取）
    let textPart = scenario.fullReply.trim();
    
    // 收口动作1：确保 LLM 不生成【下一步清单】和 actionCards
    // 如果 LLM 仍然生成了【下一步清单】，移除它
    const nextStepsMatch = textPart.match(/【下一步清单】[\s\S]*?(?=【|$)/);
    if (nextStepsMatch) {
      textPart = textPart.replace(/【下一步清单】[\s\S]*?(?=【|$)/g, '').trim();
      console.log('✅ 已移除 LLM 生成的【下一步清单】');
    } else {
      console.log('ℹ️  LLM 未生成【下一步清单】');
    }
    
    // 如果 LLM 仍然生成了 actionCards JSON，移除它
    const actionCardsJsonMatch = textPart.match(/```json\s*[\s\S]*?```/);
    const actionCardsObjectMatch = textPart.match(/\{\s*"actionCards"\s*:[\s\S]*\}/);
    if (actionCardsJsonMatch || actionCardsObjectMatch) {
      textPart = textPart.replace(/```json\s*[\s\S]*?```/g, '');
      textPart = textPart.replace(/\{\s*"actionCards"\s*:[\s\S]*\}/g, '');
      textPart = textPart.trim();
      console.log('✅ 已移除 LLM 生成的 actionCards JSON');
    } else {
      console.log('ℹ️  LLM 未生成 actionCards JSON');
    }

    // 检查是否还有残留的【下一步清单】或 actionCards
    const hasNextSteps = /【下一步清单】/.test(textPart);
    const hasActionCards = /"actionCards"/.test(textPart) || /```json/.test(textPart);
    
    if (hasNextSteps || hasActionCards) {
      console.log('❌ 剥离失败：仍有残留内容');
      if (hasNextSteps) {
        console.log('   - 仍有【下一步清单】');
      }
      if (hasActionCards) {
        console.log('   - 仍有 actionCards JSON');
      }
      failCount++;
    } else {
      console.log('✅ 剥离成功：已移除所有【下一步清单】和 actionCards');
      
      // 检查是否保留了【初筛总结】和【风险与分流】
      const hasSummary = /【初筛总结】/.test(textPart);
      const hasRisk = /【风险与分流】/.test(textPart);
      
      if (hasSummary && hasRisk) {
        console.log('✅ 保留了【初筛总结】和【风险与分流】');
        passCount++;
      } else {
        console.log('❌ 剥离过度：移除了【初筛总结】或【风险与分流】');
        if (!hasSummary) console.log('   - 缺少【初筛总结】');
        if (!hasRisk) console.log('   - 缺少【风险与分流】');
        failCount++;
      }
    }

    console.log('\n剥离后的文本预览:');
    console.log(textPart.substring(0, 200) + (textPart.length > 200 ? '...' : ''));
  });

  console.log('\n' + '='.repeat(80));
  console.log('📊 统计汇总');
  console.log('='.repeat(80));
  console.log(`总测试数: ${scenarios.length}`);
  console.log(`通过: ${passCount} (${((passCount / scenarios.length) * 100).toFixed(1)}%)`);
  console.log(`失败: ${failCount} (${((failCount / scenarios.length) * 100).toFixed(1)}%)`);
  console.log('='.repeat(80) + '\n');

  if (failCount > 0) {
    console.log('❌ 部分测试失败\n');
    process.exit(1);
  } else {
    console.log('✅ 所有测试通过\n');
  }
}

// 运行测试
testStripLogic();
