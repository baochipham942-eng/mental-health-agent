/**
 * Question Policy 回归用例
 * 验证苏格拉底式提问策略（Socratic Questioning Policy）是否正确工作
 * 
 * 测试覆盖：
 * - support/crisis 路由不输出苏格拉底挑战
 * - gap_followup 问题为单问
 * - intake 第一轮只问1个开放式问题（新策略）
 * - 第一轮不应包含可选项或0-10，第二轮应包含0-10量表
 */

import { buildIntakeQuestions, buildGapFollowupQuestion, shouldEnterAssessment } from '../lib/ai/assessment/question_policy';
import { detectGap } from '../lib/ai/assessment/gap';
import { RouteType, PressureSocraticState } from '../types/chat';

/**
 * 测试结果
 */
interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
}

/**
 * 检查问题是否包含可选项或 0-10 打分
 */
function hasOptionsOrScale(question: string): boolean {
  // 检查是否包含选项（A/B/C/D 或 括号内的选项，包括中文括号和英文括号）
  // 匹配模式：括号内包含斜杠分隔的选项，或包含A-D字母
  const hasOptions = 
    // A-D选项格式
    /[（(][^）)]*[A-D][^）)]*[）)]/.test(question) ||
    /[A-D]\)/.test(question) ||
    // 括号内包含斜杠分隔的选项（如"（几天/几周/几个月/不确定）"或"（没有/偶尔闪过/经常出现/已经计划）"）
    /[（(][^）)]*[\/／][^）)]*[）)]/.test(question) ||
    // 括号内包含"例如"或"如"后的选项列表
    /（例如[：:][^）)]+）/.test(question);
  
  // 检查是否包含 0-10 打分
  const hasScale = /0-10|0\s*到\s*10|0\s*至\s*10|0\s*～\s*10|0\s*~\s*10|打分|评分/.test(question);
  
  return hasOptions || hasScale;
}

/**
 * 检查问题是否包含 0-10 量表（更严格的检查，用于第二轮验证）
 */
function hasScale0To10(question: string): boolean {
  // 检查是否包含 0-10 打分，并且表达"影响程度/睡眠/工作/社交"等量表语义
  const hasScale = /0-10|0\s*到\s*10|0\s*至\s*10|0\s*～\s*10|0\s*~\s*10/.test(question);
  const hasImpactContext = /影响|睡眠|工作|社交|打分|评分/.test(question);
  
  return hasScale && hasImpactContext;
}

/**
 * 测试 intake 阶段
 */
function testIntakeStage(): TestResult[] {
  const results: TestResult[] = [];
  
  // 测试 1: 职场压力场景（新策略：第一轮优先苏格拉底式澄清，0-10量表放到第二轮）
  const initialMessage = '最近工作压力很大，总是担心完不成任务';
  const test1 = buildIntakeQuestions({
    userMessage: initialMessage,
    routeType: 'assessment',
  });
  
  // 第一轮（intake）断言：问题数量应为1，且必须包含苏格拉底式关键词（具体场景/发生了什么/当时闪过的想法/担心）
  results.push({
    name: '职场压力场景 - 第一轮问题数量=1',
    pass: test1.length === 1,
    error: test1.length !== 1 ? `问题数量为 ${test1.length}，应该=1` : undefined,
  });
  
  // 检查是否包含苏格拉底式关键词（具体场景/发生了什么/当时闪过的想法/担心）
  const hasSocraticKeywords = test1.length > 0 && (
    test1[0].includes('具体场景') ||
    test1[0].includes('发生了什么') ||
    test1[0].includes('当时') ||
    test1[0].includes('闪过的') ||
    test1[0].includes('想法') ||
    test1[0].includes('担心')
  );
  results.push({
    name: '职场压力场景 - 第一轮必须包含苏格拉底式关键词（具体场景/发生了什么/当时闪过的想法/担心）',
    pass: hasSocraticKeywords,
    error: test1.length === 0 ? '没有生成问题' : '第一轮问题必须包含"具体场景/发生了什么/当时闪过的想法/担心"等苏格拉底式关键词',
  });
  
  // 第一轮不应包含0-10/可选项/持续多久
  results.push({
    name: '职场压力场景 - 第一轮不应包含0-10/可选项/持续多久',
    pass: test1.length > 0 && !test1.some(q => hasOptionsOrScale(q) || q.includes('持续多久') || q.includes('持续了多久')),
    error: test1.length === 0 ? '没有生成问题' : '第一轮问题不应包含可选项、0-10打分或"持续多久"',
  });
  
  // 第二轮（gap_followup）断言：模拟用户回答第一轮问题后，应该问0-10量表
  // 模拟用户回答："通常在上班时最明显，持续了几个月"
  const followupAnswer = '通常在上班时最明显，持续了几个月';
  const gapResult = detectGap(initialMessage, followupAnswer);
  
  if (gapResult.hasGap && gapResult.gapKey === 'impact') {
    // 如果检测到 impact 缺口，调用 buildGapFollowupQuestion
    const followupQuestions = buildGapFollowupQuestion({
      userMessage: `${initialMessage} ${followupAnswer}`,
      routeType: 'assessment',
      existingIntake: gapResult.intake,
    }, 'impact');
    
    const questions = Array.isArray(followupQuestions) ? followupQuestions : (followupQuestions ? [followupQuestions] : []);
    const hasScale = questions.some(q => hasScale0To10(q));
    
    results.push({
      name: '职场压力场景 - 第二轮应包含0-10量表',
      pass: followupQuestions !== null && hasScale,
      error: followupQuestions === null ? '应该返回问题' : '第二轮问题应包含0-10量表，但不包含',
    });
  } else {
    // 如果检测到的缺口不是 impact，直接测试 impact 的 gap_followup
    const followupQuestions = buildGapFollowupQuestion({
      userMessage: initialMessage,
      routeType: 'assessment',
    }, 'impact');
    
    const questions = Array.isArray(followupQuestions) ? followupQuestions : (followupQuestions ? [followupQuestions] : []);
    const hasScale = questions.some(q => hasScale0To10(q));
    
    results.push({
      name: '职场压力场景 - 第二轮应包含0-10量表',
      pass: followupQuestions !== null && hasScale,
      error: followupQuestions === null ? '应该返回问题' : '第二轮问题应包含0-10量表，但不包含',
    });
  }
  
  // 测试 2: 家庭冲突场景（新策略：第一轮只问1个开放式问题）
  const test2 = buildIntakeQuestions({
    userMessage: '和家里人总是吵架，感觉很累',
    routeType: 'assessment',
  });
  results.push({
    name: '家庭冲突场景 - 第一轮问题数量=1',
    pass: test2.length === 1,
    error: test2.length !== 1 ? `问题数量为 ${test2.length}，应该=1` : undefined,
  });
  
  // 测试 3: 反复担心场景（新策略：第一轮只问1个开放式问题）
  const test3 = buildIntakeQuestions({
    userMessage: '我总是担心各种事情，停不下来',
    routeType: 'assessment',
  });
  results.push({
    name: '反复担心场景 - 第一轮问题数量=1',
    pass: test3.length === 1,
    error: test3.length !== 1 ? `问题数量为 ${test3.length}，应该=1` : undefined,
  });
  
  // 测试 4: 失眠场景（新策略：第一轮只问1个开放式问题）
  const test4 = buildIntakeQuestions({
    userMessage: '最近总是睡不着，很焦虑',
    routeType: 'assessment',
  });
  results.push({
    name: '失眠场景 - 第一轮问题数量=1',
    pass: test4.length === 1,
    error: test4.length !== 1 ? `问题数量为 ${test4.length}，应该=1` : undefined,
  });
  
  // 测试 5: 拖延自责场景（新策略：第一轮只问1个开放式问题）
  const test5 = buildIntakeQuestions({
    userMessage: '我总是拖延，然后很自责',
    routeType: 'assessment',
  });
  results.push({
    name: '拖延自责场景 - 第一轮问题数量=1',
    pass: test5.length === 1,
    error: test5.length !== 1 ? `问题数量为 ${test5.length}，应该=1` : undefined,
  });
  
  // 测试 6: support 路由禁用
  const test6 = buildIntakeQuestions({
    userMessage: '我只想倾诉，不要建议',
    routeType: 'support',
  });
  results.push({
    name: 'support 路由 - 不输出苏格拉底挑战',
    pass: test6.length === 0,
    error: test6.length > 0 ? `support 路由应该返回空数组，但返回了 ${test6.length} 个问题` : undefined,
  });
  
  // 测试 7: crisis 路由禁用
  const test7 = buildIntakeQuestions({
    userMessage: '我想死，不想活了',
    routeType: 'crisis',
  });
  results.push({
    name: 'crisis 路由 - 不输出苏格拉底挑战',
    pass: test7.length === 0,
    error: test7.length > 0 ? `crisis 路由应该返回空数组，但返回了 ${test7.length} 个问题` : undefined,
  });
  
  // 测试 8: emotion >= 9 时禁用
  const test8 = buildIntakeQuestions({
    userMessage: '我很难受',
    routeType: 'assessment',
    emotion: {
      label: '焦虑',
      score: 9,
    },
  });
  results.push({
    name: 'emotion >= 9 - 不输出苏格拉底挑战',
    pass: test8.length === 0,
    error: test8.length > 0 ? `emotion >= 9 应该返回空数组，但返回了 ${test8.length} 个问题` : undefined,
  });
  
  // 测试 9: 新策略下，intake 第一轮不应包含可选项或0-10（改为验证这一点）
  const allIntakeTests = [test1, test2, test3, test4, test5];
  const allQuestions = allIntakeTests.flat();
  const questionsWithOptionsOrScale = allQuestions.filter(q => hasOptionsOrScale(q));
  const ratio = allQuestions.length > 0 ? questionsWithOptionsOrScale.length / allQuestions.length : 0;
  results.push({
    name: 'intake 第一轮问题不应包含可选项或0-10（新策略）',
    pass: ratio === 0,
    error: ratio > 0 ? `比例为 ${(ratio * 100).toFixed(1)}%，应该=0%（第一轮只问开放式问题）` : undefined,
  });
  
  // 测试 10: 正向输入不应进入 assessment（不应被评估追问打断）
  const positiveTest1 = shouldEnterAssessment('今天好开心，泡了温泉还吃了水果');
  results.push({
    name: '正向输入1 - 不应进入assessment',
    pass: !positiveTest1,
    error: positiveTest1 ? '正向输入"今天好开心，泡了温泉还吃了水果"不应进入assessment' : undefined,
  });
  
  const positiveTest2 = shouldEnterAssessment('好开心');
  results.push({
    name: '正向输入2 - 不应进入assessment',
    pass: !positiveTest2,
    error: positiveTest2 ? '正向输入"好开心"不应进入assessment' : undefined,
  });
  
  // 测试 11: 正向输入不应生成评估问题
  const positiveTest3 = buildIntakeQuestions({
    userMessage: '今天好开心，泡了温泉还吃了水果',
    routeType: 'assessment',
  });
  results.push({
    name: '正向输入 - 不应生成评估问题',
    pass: positiveTest3.length === 0,
    error: positiveTest3.length > 0 ? `正向输入不应生成评估问题，但生成了${positiveTest3.length}个问题` : undefined,
  });
  
  // 测试 11b: 新增回归用例 - "今天好开心/泡温泉" → 不应返回压力评估/0-10/持续多久
  const positiveTest4 = buildIntakeQuestions({
    userMessage: '今天好开心',
    routeType: 'assessment',
  });
  const positiveTest5 = buildIntakeQuestions({
    userMessage: '泡了温泉',
    routeType: 'assessment',
  });
  results.push({
    name: '回归用例 - "今天好开心"不应返回压力评估/0-10/持续多久',
    pass: positiveTest4.length === 0,
    error: positiveTest4.length > 0 ? `正向输入"今天好开心"不应生成评估问题，但生成了${positiveTest4.length}个问题` : undefined,
  });
  results.push({
    name: '回归用例 - "泡了温泉"不应返回压力评估/0-10/持续多久',
    pass: positiveTest5.length === 0,
    error: positiveTest5.length > 0 ? `正向输入"泡了温泉"不应生成评估问题，但生成了${positiveTest5.length}个问题` : undefined,
  });
  
  // 测试 11c: 新增回归用例 - "工作压力好大" → 第一问必须为苏格拉底式（情境+想法），不得出现 0-10/持续多久
  const stressTest1 = buildIntakeQuestions({
    userMessage: '工作压力好大',
    routeType: 'assessment',
  });
  const hasStressSocratic = stressTest1.length > 0 && (
    stressTest1[0].includes('具体场景') ||
    stressTest1[0].includes('发生了什么') ||
    stressTest1[0].includes('当时') ||
    stressTest1[0].includes('闪过的') ||
    stressTest1[0].includes('想法') ||
    stressTest1[0].includes('担心')
  );
  const hasForbiddenKeywords = stressTest1.some(q => 
    hasOptionsOrScale(q) || 
    q.includes('持续多久') || 
    q.includes('持续了多久') ||
    q.includes('0-10') ||
    q.includes('打分') ||
    q.includes('评分')
  );
  results.push({
    name: '回归用例 - "工作压力好大"第一问必须为苏格拉底式（情境+想法）',
    pass: stressTest1.length > 0 && hasStressSocratic,
    error: stressTest1.length === 0 
      ? '应该返回问题' 
      : !hasStressSocratic 
        ? '第一问必须包含"具体场景/发生了什么/当时闪过的想法/担心"等苏格拉底式关键词' 
        : undefined,
  });
  results.push({
    name: '回归用例 - "工作压力好大"第一问不得出现 0-10/持续多久',
    pass: stressTest1.length > 0 && !hasForbiddenKeywords,
    error: stressTest1.length === 0 
      ? '应该返回问题' 
      : hasForbiddenKeywords 
        ? '第一问不得包含0-10/持续多久/打分/评分等关键词' 
        : undefined,
  });
  
  // 测试 12: 用例 A - 工作压力场景（intake阶段）-> 必须苏格拉底，不得自伤
  const test12 = buildIntakeQuestions({
    userMessage: '工作压力好大',
    routeType: 'assessment',
    emotion: {
      label: '焦虑',
      score: 8, // 高负向情绪强度，但不应该触发自伤追问
    },
  });
  
  // 检查是否包含自伤相关字样（不应该包含）
  const test12HasRiskKeywords = test12.some(q => 
    q.includes('伤害自己') || 
    q.includes('自伤') || 
    q.includes('不想活') || 
    q.includes('想死')
  );
  
  results.push({
    name: '用例 A - 工作压力场景（intake阶段）- 不得自伤',
    pass: test12.length > 0 && !test12HasRiskKeywords,
    error: test12.length === 0 
      ? '应该返回问题' 
      : test12HasRiskKeywords 
        ? '不得包含自伤相关字样（伤害自己/自伤/不想活/想死）' 
        : undefined,
  });
  
  // 测试 13: 用例 B - 明确风险场景（intake阶段）-> 必须自伤追问
  // 使用弱风险线索（不是明确的自杀表达，否则会走 crisis 路由）
  const test13 = buildIntakeQuestions({
    userMessage: '我最近很绝望，看不到希望',
    routeType: 'assessment',
    emotion: {
      label: '抑郁',
      score: 8, // 高负向情绪强度
    },
  });
  
  // 检查是否包含自伤安全问题
  const test13HasRiskQuestion = test13.some(q => 
    q.includes('伤害自己') || 
    q.includes('自伤') || 
    q.includes('为了确认你的安全')
  );
  
  results.push({
    name: '用例 B - 明确风险场景（intake阶段）- 必须自伤追问',
    pass: test13.length > 0 && test13HasRiskQuestion,
    error: test13.length === 0 
      ? '应该返回问题' 
      : !test13HasRiskQuestion 
        ? '应该包含自伤安全问题（伤害自己/自伤/为了确认你的安全）' 
        : undefined,
  });
  
  // 测试 14: 用例 1 - "最近压力好大" → 第一轮必须包含"具体场景/发生了什么" + "想法/担心"
  const test14 = buildIntakeQuestions({
    userMessage: '最近压力好大',
    routeType: 'assessment',
  });
  
  const test14HasSituation = test14.some(q => 
    q.includes('具体场景') || 
    q.includes('发生了什么')
  );
  const test14HasThought = test14.some(q => 
    q.includes('想法') || 
    q.includes('担心')
  );
  
  results.push({
    name: '用例 1 - "最近压力好大" → 第一轮必须包含"具体场景/发生了什么" + "想法/担心"',
    pass: test14.length > 0 && test14HasSituation && test14HasThought,
    error: test14.length === 0 
      ? '应该返回问题' 
      : !test14HasSituation 
        ? '应该包含"具体场景/发生了什么"' 
        : !test14HasThought 
          ? '应该包含"想法/担心"' 
          : undefined,
  });
  
  // 测试 15: 用例 4 - 正向输入 "今天好开心/泡温泉" → 不应进入压力追问/量化
  const test15a = buildIntakeQuestions({
    userMessage: '今天好开心',
    routeType: 'assessment',
  });
  const test15b = buildIntakeQuestions({
    userMessage: '泡温泉',
    routeType: 'assessment',
  });
  
  results.push({
    name: '用例 4a - 正向输入 "今天好开心" → 不应进入压力追问',
    pass: test15a.length === 0,
    error: test15a.length > 0 ? `正向输入"今天好开心"不应生成评估问题，但生成了${test15a.length}个问题` : undefined,
  });
  
  results.push({
    name: '用例 4b - 正向输入 "泡温泉" → 不应进入压力追问',
    pass: test15b.length === 0,
    error: test15b.length > 0 ? `正向输入"泡温泉"不应生成评估问题，但生成了${test15b.length}个问题` : undefined,
  });
  
  return results;
}

/**
 * 测试 gap_followup 阶段
 */
function testGapFollowupStage(): TestResult[] {
  const results: TestResult[] = [];
  
  // 测试 1: context 缺失
  const test1 = buildGapFollowupQuestion({
    userMessage: '我很难受',
    routeType: 'assessment',
  }, 'context');
  const test1Questions = Array.isArray(test1) ? test1 : (test1 ? [test1] : []);
  results.push({
    name: 'gap_followup context - 返回问题',
    pass: test1 !== null && test1Questions.length > 0,
    error: test1 === null ? '应该返回问题' : '应该返回至少一个问题',
  });
  results.push({
    name: 'gap_followup context - 包含可选项',
    pass: test1 !== null && test1Questions.some(q => hasOptionsOrScale(q)),
    error: test1 === null ? '应该返回问题' : '问题不包含可选项或0-10打分',
  });
  
  // 测试 2: duration 缺失
  const test2 = buildGapFollowupQuestion({
    userMessage: '我很难受',
    routeType: 'assessment',
  }, 'duration');
  const test2Questions = Array.isArray(test2) ? test2 : (test2 ? [test2] : []);
  results.push({
    name: 'gap_followup duration - 返回问题',
    pass: test2 !== null && test2Questions.length > 0,
    error: test2 === null ? '应该返回问题' : '应该返回至少一个问题',
  });
  results.push({
    name: 'gap_followup duration - 包含可选项',
    pass: test2 !== null && test2Questions.some(q => hasOptionsOrScale(q)),
    error: test2 === null ? '应该返回问题' : '问题不包含可选项或0-10打分',
  });
  
  // 测试 3: impact 缺失
  const test3 = buildGapFollowupQuestion({
    userMessage: '我很难受',
    routeType: 'assessment',
  }, 'impact');
  const test3Questions = Array.isArray(test3) ? test3 : (test3 ? [test3] : []);
  results.push({
    name: 'gap_followup impact - 返回问题',
    pass: test3 !== null && test3Questions.length > 0,
    error: test3 === null ? '应该返回问题' : '应该返回至少一个问题',
  });
  results.push({
    name: 'gap_followup impact - 包含0-10打分',
    pass: test3 !== null && test3Questions.some(q => hasOptionsOrScale(q)),
    error: test3 === null ? '应该返回问题' : '问题不包含可选项或0-10打分',
  });
  
  // 测试 4: risk 缺失
  const test4 = buildGapFollowupQuestion({
    userMessage: '我很难受',
    routeType: 'assessment',
  }, 'risk');
  const test4Questions = Array.isArray(test4) ? test4 : (test4 ? [test4] : []);
  results.push({
    name: 'gap_followup risk - 返回单问',
    pass: test4 !== null && test4Questions.length === 1,
    error: test4 === null ? '应该返回问题' : `应该返回1个问题，实际返回${test4Questions.length}个`,
  });
  results.push({
    name: 'gap_followup risk - 包含可选项',
    pass: test4 !== null && test4Questions.some(q => hasOptionsOrScale(q)),
    error: test4 === null ? '应该返回问题' : '问题不包含可选项或0-10打分',
  });
  
  // 测试 5: 职场压力场景 - 应返回 2 问（Q1 苏格拉底式，Q2 0-10）
  const test5 = buildGapFollowupQuestion({
    userMessage: '工作压力好大，睡不好',
    routeType: 'assessment',
  }, 'context');
  const test5Questions = Array.isArray(test5) ? test5 : (test5 ? [test5] : []);
  results.push({
    name: '职场压力场景 - 返回2问',
    pass: test5 !== null && test5Questions.length === 2,
    error: test5 === null ? '应该返回问题' : `应该返回2个问题，实际返回${test5Questions.length}个`,
  });
  
  // 检查 Q1 是否包含苏格拉底式引导（具体例子/情境/念头）
  const hasSocraticPhrase = test5Questions.length > 0 && (
    test5Questions[0].includes('最近一次') ||
    test5Questions[0].includes('具体') ||
    test5Questions[0].includes('场景') ||
    test5Questions[0].includes('发生了什么') ||
    test5Questions[0].includes('念头')
  );
  results.push({
    name: '职场压力场景 - Q1包含苏格拉底式引导',
    pass: hasSocraticPhrase,
    error: 'Q1应该包含"最近一次/具体场景/发生了什么/念头"等苏格拉底式引导',
  });
  
  // 检查 Q2 是否包含 0-10 量表
  const hasScale = test5Questions.length > 1 && hasScale0To10(test5Questions[1]);
  results.push({
    name: '职场压力场景 - Q2包含0-10量表',
    pass: hasScale,
    error: 'Q2应该包含0-10量表（0=几乎无影响，10=严重影响）',
  });
  
  // 测试 6: support 路由禁用
  const test6 = buildGapFollowupQuestion({
    userMessage: '我只想倾诉',
    routeType: 'support',
  }, 'context');
  results.push({
    name: 'gap_followup support 路由 - 不输出苏格拉底挑战',
    pass: test6 === null,
    error: test6 !== null ? 'support 路由应该返回 null' : undefined,
  });
  
  // 测试 7: crisis 路由禁用
  const test7 = buildGapFollowupQuestion({
    userMessage: '我想死',
    routeType: 'crisis',
  }, 'context');
  results.push({
    name: 'gap_followup crisis 路由 - 不输出苏格拉底挑战',
    pass: test7 === null,
    error: test7 !== null ? 'crisis 路由应该返回 null' : undefined,
  });
  
  // 测试 8: riskLevel frequent 时禁用
  const test8 = buildGapFollowupQuestion({
    userMessage: '我很难受',
    routeType: 'assessment',
    riskLevel: 'frequent',
  }, 'context');
  results.push({
    name: 'gap_followup riskLevel frequent - 不输出苏格拉底挑战',
    pass: test8 === null,
    error: test8 !== null ? 'riskLevel frequent 应该返回 null' : undefined,
  });
  
  // 测试 9: riskLevel plan 时禁用
  const test9 = buildGapFollowupQuestion({
    userMessage: '我很难受',
    routeType: 'assessment',
    riskLevel: 'plan',
  }, 'context');
  results.push({
    name: 'gap_followup riskLevel plan - 不输出苏格拉底挑战',
    pass: test9 === null,
    error: test9 !== null ? 'riskLevel plan 应该返回 null' : undefined,
  });
  
  // 测试 10: 用例 A - 工作压力场景 -> 必须苏格拉底，不得自伤
  const test10 = buildGapFollowupQuestion({
    userMessage: '工作压力好大',
    routeType: 'assessment',
    emotion: {
      label: '焦虑',
      score: 8, // 高负向情绪强度，但不应该触发自伤追问
    },
  }, 'risk'); // 即使 missingSlot 是 'risk'，也应该走苏格拉底式追问
  const test10Questions = Array.isArray(test10) ? test10 : (test10 ? [test10] : []);
  
  // 检查是否包含苏格拉底关键词
  const hasSocraticKeywords = test10Questions.some(q => 
    q.includes('最近一次') || 
    q.includes('具体') || 
    q.includes('场景') || 
    q.includes('发生了什么') || 
    q.includes('闪过的念头') ||
    q.includes('当时你怎么想')
  );
  
  // 检查是否包含自伤相关字样（不应该包含）
  const hasRiskKeywords = test10Questions.some(q => 
    q.includes('伤害自己') || 
    q.includes('自伤') || 
    q.includes('不想活') || 
    q.includes('想死')
  );
  
  results.push({
    name: '用例 A - 工作压力场景 - 必须苏格拉底，不得自伤',
    pass: test10 !== null && hasSocraticKeywords && !hasRiskKeywords,
    error: test10 === null 
      ? '应该返回问题' 
      : !hasSocraticKeywords 
        ? '应该包含苏格拉底关键词（最近一次/具体场景/发生了什么/闪过的念头）' 
        : hasRiskKeywords 
          ? '不得包含自伤相关字样（伤害自己/自伤/不想活/想死）' 
          : undefined,
  });
  
  // 检查是否包含 0-10 量表（可选，但建议存在）
  const test10HasScale = test10Questions.some(q => hasScale0To10(q));
  results.push({
    name: '用例 A - 工作压力场景 - 应包含 0-10 量表',
    pass: test10HasScale,
    error: '应该包含 0-10 量表（0=几乎无影响，10=严重影响）',
  });
  
  // 测试 11: 用例 B - 明确风险场景 -> 必须自伤追问
  // 使用弱风险线索（不是明确的自杀表达，否则会走 crisis 路由）
  const test11 = buildGapFollowupQuestion({
    userMessage: '我最近很绝望，看不到希望',
    routeType: 'assessment',
    emotion: {
      label: '抑郁',
      score: 8, // 高负向情绪强度
    },
  }, 'risk');
  const test11Questions = Array.isArray(test11) ? test11 : (test11 ? [test11] : []);
  
  // 检查是否包含自伤安全问题
  const hasRiskQuestion = test11Questions.some(q => 
    q.includes('伤害自己') || 
    q.includes('自伤') || 
    q.includes('为了确认你的安全')
  );
  
  results.push({
    name: '用例 B - 明确风险场景 - 必须自伤追问',
    pass: test11 !== null && hasRiskQuestion,
    error: test11 === null 
      ? '应该返回问题' 
      : !hasRiskQuestion 
        ? '应该包含自伤安全问题（伤害自己/自伤/为了确认你的安全）' 
        : undefined,
  });
  
  // 测试 12: 用例 2 - 第二轮用户回 "被领导骂了" → 只问 thought（不得重复整段首问）
  // 模拟：第一轮已经问过苏格拉底首问，用户回答"被领导骂了"（有场景，缺想法）
  const test12 = buildGapFollowupQuestion({
    userMessage: '被领导骂了',
    routeType: 'assessment',
    existingIntake: {
      context: '被领导骂了', // 模拟已经问过并得到场景
    },
  }, 'context');
  const test12Questions = Array.isArray(test12) ? test12 : (test12 ? [test12] : []);
  
  // 检查是否只问想法，不重复整段首问
  const test12OnlyAsksThought = test12Questions.some(q => 
    (q.includes('想法') || q.includes('担心')) && 
    !q.includes('具体场景') && 
    !q.includes('发生了什么')
  ) || test12Questions.some(q => 
    q.includes('脑子里闪过') && 
    !q.includes('具体场景是什么')
  );
  
  const test12RepeatsFullQuestion = test12Questions.some(q => 
    q.includes('具体场景是什么') && 
    q.includes('发生了什么') && 
    q.includes('想法或担心')
  );
  
  results.push({
    name: '用例 2 - 第二轮用户回 "被领导骂了" → 只问 thought（不得重复整段首问）',
    pass: test12 !== null && test12OnlyAsksThought && !test12RepeatsFullQuestion,
    error: test12 === null 
      ? '应该返回问题' 
      : test12RepeatsFullQuestion 
        ? '不得重复整段首问（包含"具体场景是什么"+"发生了什么"+"想法或担心"）' 
        : !test12OnlyAsksThought 
          ? '应该只问想法/担心，不重复整段首问' 
          : undefined,
  });
  
  // 测试 13: 用例 3 - 第二轮用户回 "我就觉得我完了会被开" → 只问 situation
  // 模拟：第一轮已经问过苏格拉底首问，用户回答"我就觉得我完了会被开"（有想法，缺场景）
  const test13 = buildGapFollowupQuestion({
    userMessage: '我就觉得我完了会被开',
    routeType: 'assessment',
    existingIntake: {
      mainIssue: '我就觉得我完了会被开', // 模拟已经问过并得到想法
    },
  }, 'context');
  const test13Questions = Array.isArray(test13) ? test13 : (test13 ? [test13] : []);
  
  // 检查是否只问场景，不重复整段首问
  const test13OnlyAsksSituation = test13Questions.some(q => 
    (q.includes('具体场景') || q.includes('发生了什么')) && 
    !q.includes('想法') && 
    !q.includes('担心')
  );
  
  const test13RepeatsFullQuestion = test13Questions.some(q => 
    q.includes('具体场景是什么') && 
    q.includes('发生了什么') && 
    q.includes('想法或担心')
  );
  
  results.push({
    name: '用例 3 - 第二轮用户回 "我就觉得我完了会被开" → 只问 situation',
    pass: test13 !== null && test13OnlyAsksSituation && !test13RepeatsFullQuestion,
    error: test13 === null 
      ? '应该返回问题' 
      : test13RepeatsFullQuestion 
        ? '不得重复整段首问（包含"具体场景是什么"+"发生了什么"+"想法或担心"）' 
        : !test13OnlyAsksSituation 
          ? '应该只问场景，不重复整段首问' 
          : undefined,
  });
  
  // 测试 14: 用例 4 - "烦死了 傻逼" → 只问 situation（因为 hasOnlyEmotion=true）
  // 模拟：第一轮已经问过苏格拉底首问，用户回答"烦死了 傻逼"（只有情绪，没有场景和想法）
  // 注意：由于 hasAskedSocraticQuestions 现在会忽略空字符串，我们需要设置一个非空值来表示已问过
  const test14 = buildGapFollowupQuestion({
    userMessage: '烦死了 傻逼',
    routeType: 'assessment',
    existingIntake: {
      // 模拟已经问过首问，但用户只回答了情绪词
      // 设置一个占位符表示已问过（但实际没有场景信息）
      context: '已问过', // 非空字符串表示问过，但实际没有场景信息
    },
    pressureSocratic: {
      asked: true,
      situationDone: false, // 没有场景
      thoughtDone: false,   // 没有想法
    } as PressureSocraticState,
  }, 'context');
  const test14Questions = Array.isArray(test14) ? test14 : (test14 ? [test14] : []);
  
  // 检查是否只问场景，不重复整段首问
  const test14OnlyAsksSituation = test14Questions.some(q => 
    (q.includes('具体场景') || q.includes('发生了什么')) && 
    !q.includes('想法') && 
    !q.includes('担心')
  );
  
  const test14RepeatsFullQuestion = test14Questions.some(q => 
    q.includes('具体场景是什么') && 
    q.includes('发生了什么') && 
    q.includes('想法或担心')
  );
  
  results.push({
    name: '用例 4 - "烦死了 傻逼" → 只问 situation（因为 hasOnlyEmotion=true）',
    pass: test14 !== null && test14OnlyAsksSituation && !test14RepeatsFullQuestion,
    error: test14 === null 
      ? '应该返回问题' 
      : test14RepeatsFullQuestion 
        ? '不得重复整段首问（包含"具体场景是什么"+"发生了什么"+"想法或担心"）' 
        : !test14OnlyAsksSituation 
          ? '应该只问场景，不重复整段首问（因为 hasOnlyEmotion=true）' 
          : undefined,
  });
  
  // 测试 15: 用例 5 - 正向："今天好开心 泡温泉" → 不进入压力苏格拉底链路
  const test15 = buildIntakeQuestions({
    userMessage: '今天好开心 泡温泉',
    routeType: 'assessment',
  });
  
  results.push({
    name: '用例 5 - 正向："今天好开心 泡温泉" → 不进入压力苏格拉底链路',
    pass: test15.length === 0,
    error: test15.length > 0 ? `正向输入"今天好开心 泡温泉"不应生成评估问题，但生成了${test15.length}个问题` : undefined,
  });
  
  return results;
}

/**
 * 测试多轮压力 case（新增）
 */
function testMultiTurnStressCase(): TestResult[] {
  const results: TestResult[] = [];
  
  // 测试 1: Turn1 - user = "压力好大" → assistant 必须问苏格拉底（包含 场景 + 想法 的追问）
  const turn1User = '压力好大';
  const turn1Questions = buildIntakeQuestions({
    userMessage: turn1User,
    routeType: 'assessment',
  });
  
  const turn1HasSocratic = turn1Questions.some(q => 
    (q.includes('具体场景') || q.includes('发生了什么')) && 
    (q.includes('想法') || q.includes('担心'))
  );
  
  results.push({
    name: '多轮压力 case - Turn1: "压力好大" → 必须问苏格拉底（场景+想法）',
    pass: turn1Questions.length > 0 && turn1HasSocratic,
    error: turn1Questions.length === 0 
      ? '应该返回问题' 
      : !turn1HasSocratic 
        ? '必须包含"具体场景/发生了什么"和"想法/担心"的苏格拉底追问' 
        : undefined,
  });
  
  // 测试 2: Turn2 - user = "被老板骂了，担心被开" → assistant 不得重复 Turn1 的苏格拉底问题；必须进入下一步（持续时间/影响 0-10 等）
  // 模拟：第一轮已经问过苏格拉底首问，用户回答"被老板骂了，担心被开"（有场景+想法）
  const turn2User = '被老板骂了，担心被开';
  const turn2GapResult = detectGap(turn1User, turn2User);
  
  // 创建模拟的 existingIntake（表示已经问过苏格拉底问题）
  const mockIntake = {
    context: '被老板骂了',
    mainIssue: '担心被开',
  };
  
  // 创建模拟的 pressureSocratic 状态（表示已经问过，且槽位都齐了）
  const mockPressureSocratic: PressureSocraticState = {
    asked: true,
    situationDone: true,
    thoughtDone: true,
  };
  
  const turn2Questions = buildGapFollowupQuestion({
    userMessage: turn2User,
    routeType: 'assessment',
    existingIntake: mockIntake,
    pressureSocratic: mockPressureSocratic,
  }, turn2GapResult.hasGap ? turn2GapResult.gapKey : 'impact');
  
  const turn2QuestionsArray = turn2Questions 
    ? (Array.isArray(turn2Questions) ? turn2Questions : [turn2Questions])
    : [];
  
  // 检查是否重复了苏格拉底首问（不得包含"具体场景是什么"+"发生了什么"+"想法或担心"的组合）
  const turn2RepeatsSocratic = turn2QuestionsArray.some(q => 
    q.includes('具体场景是什么') && 
    q.includes('发生了什么') && 
    (q.includes('想法或担心') || q.includes('想法') || q.includes('担心'))
  );
  
  // 检查是否进入下一步（持续时间/影响 0-10）
  const turn2HasNextStep = turn2QuestionsArray.some(q => 
    q.includes('持续多久') || 
    q.includes('0-10') || 
    q.includes('影响') ||
    q.includes('打分')
  );
  
  results.push({
    name: '多轮压力 case - Turn2: "被老板骂了，担心被开" → 不得重复苏格拉底问题',
    pass: !turn2RepeatsSocratic,
    error: turn2RepeatsSocratic 
      ? '不得重复 Turn1 的苏格拉底问题（包含"具体场景是什么"+"发生了什么"+"想法或担心"）' 
      : undefined,
  });
  
  results.push({
    name: '多轮压力 case - Turn2: "被老板骂了，担心被开" → 必须进入下一步（持续时间/影响 0-10）',
    pass: turn2QuestionsArray.length > 0 && turn2HasNextStep,
    error: turn2QuestionsArray.length === 0 
      ? '应该返回问题' 
      : !turn2HasNextStep 
        ? '必须进入下一步（持续时间/影响 0-10），但不包含相关关键词' 
        : undefined,
  });
  
  // 测试 3: Turn3 - 确保不会出现"我想再确认两个小问题："但没有问题的情况
  // 模拟：用户已经回答了所有必要信息，不应该再有问题
  const turn3User = '持续了两个月，影响大概7分';
  const turn3GapResult = detectGap(turn1User, `${turn2User} ${turn3User}`);
  
  // 如果已经没有缺口，不应该返回问题
  if (!turn3GapResult.hasGap) {
    results.push({
      name: '多轮压力 case - Turn3: 无缺口时不应返回问题',
      pass: true,
    });
  } else {
    // 如果有缺口，确保返回的问题不为空
    const turn3Questions = buildGapFollowupQuestion({
      userMessage: `${turn2User} ${turn3User}`,
      routeType: 'assessment',
      existingIntake: turn3GapResult.intake,
      pressureSocratic: {
        asked: true,
        situationDone: true,
        thoughtDone: true,
      } as PressureSocraticState,
    }, turn3GapResult.gapKey);
    
    const turn3QuestionsArray = turn3Questions 
      ? (Array.isArray(turn3Questions) ? turn3Questions : [turn3Questions])
      : [];
    
    // 检查是否有空问题
    const hasEmptyQuestions = turn3QuestionsArray.some(q => !q || q.trim().length === 0);
    
    results.push({
      name: '多轮压力 case - Turn3: 确保不会出现空问题',
      pass: !hasEmptyQuestions,
      error: hasEmptyQuestions 
        ? '不应该出现空问题' 
        : undefined,
    });
  }
  
  // 测试 4: 验证空前缀输出问题 - 如果 questions.length === 0，不应该输出"我想再确认两个小问题："
  // 这个测试需要在 route.ts 层面进行，但我们可以验证 buildGapFollowupQuestion 不会返回空数组
  const test4Questions = buildGapFollowupQuestion({
    userMessage: '被老板骂了，担心被开',
    routeType: 'assessment',
    existingIntake: {
      context: '被老板骂了',
      mainIssue: '担心被开',
      duration: '两个月',
      impactScore: 7,
      riskLevel: 'none',
    },
    pressureSocratic: {
      asked: true,
      situationDone: true,
      thoughtDone: true,
    },
  }, 'context'); // 即使 missingSlot 是 context，但由于已有 context，应该返回 null 或空数组
  
  // 如果返回 null，说明没有需要问的问题，这是正确的
  // 如果返回空数组，也是可以接受的（调用方需要处理）
  const test4IsValid = test4Questions === null || 
    (Array.isArray(test4Questions) && test4Questions.length === 0) ||
    (Array.isArray(test4Questions) && test4Questions.every(q => q && q.trim().length > 0));
  
  results.push({
    name: '多轮压力 case - 空前缀测试: 如果无问题，应返回 null 或空数组，不应返回空字符串',
    pass: test4IsValid,
    error: !test4IsValid 
      ? '如果无问题，应返回 null 或空数组，不应返回包含空字符串的数组' 
      : undefined,
  });
  
  return results;
}

/**
 * 运行所有测试
 */
function runAllTests(): void {
  console.log('开始运行 Question Policy 回归用例...\n');
  
  const intakeResults = testIntakeStage();
  const gapFollowupResults = testGapFollowupStage();
  const multiTurnStressResults = testMultiTurnStressCase();
  
  const allResults = [...intakeResults, ...gapFollowupResults, ...multiTurnStressResults];
  const passed = allResults.filter(r => r.pass).length;
  const failed = allResults.filter(r => !r.pass);
  
  console.log(`\n测试结果：${passed}/${allResults.length} 通过\n`);
  
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
