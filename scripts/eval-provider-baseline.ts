import 'dotenv/config';
import { continueAssessment } from '@/lib/ai/assessment';
import { generateSupportReply } from '@/lib/ai/support';
import { classifyDialogueState } from '@/lib/ai/agents/state-classifier';

type EvalCase = {
  id: string;
  kind: 'support' | 'assessment' | 'state_classifier';
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

const cases: EvalCase[] = [
  {
    id: 'support-anxiety',
    kind: 'support',
    message: '这两天一到晚上就开始心慌，感觉脑子停不下来。',
  },
  {
    id: 'support-freeze',
    kind: 'support',
    message: '我今天什么都不想做，像被冻住了一样。',
  },
  {
    id: 'assessment-followup',
    kind: 'assessment',
    history: [
      { role: 'assistant', content: '如果用0到10分描述这件事对你的影响，你会打几分？' },
      { role: 'user', content: '大概7分吧。' },
    ],
    message: '是和工作有关，最近两周领导一直当众否定我，我每天都很紧张。',
  },
  {
    id: 'state-classifier-mid',
    kind: 'state_classifier',
    history: [
      { role: 'assistant', content: '最近最困扰你的是什么？' },
      { role: 'user', content: '工作压力特别大。' },
      { role: 'assistant', content: '如果用0到10分描述影响程度，你会打几分？' },
      { role: 'user', content: '7分。' },
    ],
    message: '主要是领导总说我做得不够好，我现在一想到上班就焦虑。',
  },
];

async function runCase(testCase: EvalCase) {
  const startedAt = Date.now();

  if (testCase.kind === 'support') {
    const reply = await generateSupportReply(testCase.message, testCase.history || []);
    return {
      id: testCase.id,
      kind: testCase.kind,
      durationMs: Date.now() - startedAt,
      output: reply,
    };
  }

  if (testCase.kind === 'assessment') {
    const result = await continueAssessment(testCase.message, testCase.history || []);
    return {
      id: testCase.id,
      kind: testCase.kind,
      durationMs: Date.now() - startedAt,
      output: {
        reply: result.reply,
        isConclusion: result.isConclusion,
      },
    };
  }

  const history = [...(testCase.history || []), { role: 'user' as const, content: testCase.message }];
  const result = await classifyDialogueState(history);
  return {
    id: testCase.id,
    kind: testCase.kind,
    durationMs: Date.now() - startedAt,
    output: result,
  };
}

async function main() {
  console.log('== Provider Baseline Eval ==');
  console.log(`DEFAULT_LLM_PROVIDER=${process.env.DEFAULT_LLM_PROVIDER || 'deepseek'}`);
  console.log(`SUPPORT_LLM_PROVIDER=${process.env.SUPPORT_LLM_PROVIDER || '(inherit)'}`);
  console.log(`ASSESSMENT_LLM_PROVIDER=${process.env.ASSESSMENT_LLM_PROVIDER || '(inherit)'}`);
  console.log(`STATE_CLASSIFIER_LLM_PROVIDER=${process.env.STATE_CLASSIFIER_LLM_PROVIDER || '(inherit)'}`);

  for (const testCase of cases) {
    console.log(`\n[${testCase.id}] ${testCase.kind}`);
    const result = await runCase(testCase);
    console.log(`duration=${result.durationMs}ms`);
    console.log(typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2));
  }
}

main().catch((error) => {
  console.error('\nProvider baseline eval failed');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
