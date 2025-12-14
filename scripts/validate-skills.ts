/**
 * Skill 验证脚本
 * 扫描 registry，validate 全量 skills，不通过 exit 1
 */

import { getAllSkills } from '../lib/skills/registry';
import { validateAllSkills, validateSkillRenderResult } from '../lib/skills/validate';
import { renderSkills, renderSkill } from '../lib/skills/render';
import { getSkillById } from '../lib/skills/registry';

console.log('🔍 开始验证 Skills...\n');

// 1. 验证所有 Skill 定义
const allSkills = getAllSkills();
console.log(`📋 发现 ${allSkills.length} 个 Skills\n`);

const definitionResult = validateAllSkills(allSkills);

if (definitionResult.errors.length > 0) {
  console.log('❌ Skill 定义验证失败：\n');
  definitionResult.errors.forEach(err => {
    console.log(`  [${err.location}] ${err.message}`);
    if (err.details) {
      console.log(`    详情: ${JSON.stringify(err.details, null, 2)}`);
    }
  });
  console.log('');
}

if (definitionResult.warnings.length > 0) {
  console.log('⚠️  Skill 定义警告：\n');
  definitionResult.warnings.forEach(warn => {
    console.log(`  [${warn.location}] ${warn.message}`);
    if (warn.details) {
      console.log(`    详情: ${JSON.stringify(warn.details, null, 2)}`);
    }
  });
  console.log('');
}

// 2. 验证每个 Skill 的渲染结果（使用默认槽位值）
console.log('🎨 验证 Skill 渲染结果...\n');

let renderErrors = 0;
let renderWarnings = 0;

for (const skill of allSkills) {
  // 生成默认槽位值
  const defaultSlotValues: Record<string, string | number> = {};
  for (const slot of skill.slots) {
    if (slot.defaultValue !== undefined) {
      defaultSlotValues[slot.name] = slot.defaultValue;
    } else {
      // 如果没有默认值，使用类型推断的默认值
      switch (slot.type) {
        case 'count':
          defaultSlotValues[slot.name] = 1;
          break;
        case 'number':
          defaultSlotValues[slot.name] = 3;
          break;
        case 'duration':
          defaultSlotValues[slot.name] = '7';
          break;
        case 'string':
          defaultSlotValues[slot.name] = '当需要时';
          break;
        default:
          defaultSlotValues[slot.name] = '';
      }
    }
  }

  // 渲染 Skill
  try {
    const renderResult = renderSkill(skill, defaultSlotValues);
    
    // 验证渲染结果
    const renderValidation = validateSkillRenderResult(skill, renderResult, defaultSlotValues);
    
    if (renderValidation.errors.length > 0) {
      renderErrors += renderValidation.errors.length;
      console.log(`❌ [${skill.id}] 渲染验证失败：`);
      renderValidation.errors.forEach(err => {
        console.log(`  [${err.location}] ${err.message}`);
        if (err.details) {
          console.log(`    详情: ${JSON.stringify(err.details, null, 2)}`);
        }
      });
      console.log('');
    }
    
    if (renderValidation.warnings.length > 0) {
      renderWarnings += renderValidation.warnings.length;
      console.log(`⚠️  [${skill.id}] 渲染警告：`);
      renderValidation.warnings.forEach(warn => {
        console.log(`  [${warn.location}] ${warn.message}`);
        if (warn.details) {
          console.log(`    详情: ${JSON.stringify(warn.details, null, 2)}`);
        }
      });
      console.log('');
    }
  } catch (error) {
    renderErrors++;
    console.log(`❌ [${skill.id}] 渲染异常：${error instanceof Error ? error.message : String(error)}`);
    console.log('');
  }
}

// 3. 验证 renderSkills 函数（确保返回 2 个 actionCards）
console.log('🔗 验证 renderSkills 函数...\n');

try {
  // 创建测试选择（选择前 2 个 skills）
  const testSelections = allSkills.slice(0, Math.min(2, allSkills.length)).map(skill => {
    const defaultSlotValues: Record<string, string | number> = {};
    for (const slot of skill.slots) {
      defaultSlotValues[slot.name] = slot.defaultValue || (slot.type === 'count' ? 1 : slot.type === 'number' ? 3 : slot.type === 'duration' ? '7' : '当需要时');
    }
    return { skillId: skill.id, slotValues: defaultSlotValues };
  });

  const renderedOutput = renderSkills(testSelections);
  
  if (renderedOutput.actionCards.length !== 2) {
    console.log(`❌ renderSkills 返回的 actionCards 数量不正确：期望 2，实际 ${renderedOutput.actionCards.length}`);
    renderErrors++;
  } else {
    console.log(`✅ renderSkills 返回正确的 actionCards 数量：2`);
  }
  
  if (renderedOutput.nextStepsLines.length < 2 || renderedOutput.nextStepsLines.length > 3) {
    console.log(`⚠️  renderSkills 返回的 nextStepsLines 数量不符合推荐：期望 2-3，实际 ${renderedOutput.nextStepsLines.length}`);
    renderWarnings++;
  } else {
    console.log(`✅ renderSkills 返回正确的 nextStepsLines 数量：${renderedOutput.nextStepsLines.length}`);
  }
  
  console.log('');
} catch (error) {
  renderErrors++;
  console.log(`❌ renderSkills 测试异常：${error instanceof Error ? error.message : String(error)}`);
  console.log('');
}

// 汇总
console.log('='.repeat(80));
console.log('📊 验证汇总：');
console.log(`  Skill 定义错误: ${definitionResult.errors.length}`);
console.log(`  Skill 定义警告: ${definitionResult.warnings.length}`);
console.log(`  Skill 渲染错误: ${renderErrors}`);
console.log(`  Skill 渲染警告: ${renderWarnings}`);
console.log('='.repeat(80));
console.log('');

if (definitionResult.errors.length > 0 || renderErrors > 0) {
  console.log('❌ 验证失败，请修复上述错误后重试\n');
  process.exit(1);
} else {
  console.log('✅ 所有验证通过\n');
  process.exit(0);
}
