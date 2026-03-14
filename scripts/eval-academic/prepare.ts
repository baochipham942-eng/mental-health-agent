/**
 * 数据集下载与导入
 *
 * 用法:
 *   bun scripts/eval-academic/prepare.ts                 # 导入全部
 *   bun scripts/eval-academic/prepare.ts --dataset esconv
 *   bun scripts/eval-academic/prepare.ts --dataset psy-insight
 *   bun scripts/eval-academic/prepare.ts --dataset cpsycoun
 *   bun scripts/eval-academic/prepare.ts --stats         # 查看统计
 */

import * as fs from 'fs';
import * as path from 'path';
import { upsertDataset, updateDatasetCount, insertCase, getDatasets, getCaseCount, closeDb, type DialogTurn } from './db';

const TMP_DIR = path.join(__dirname, 'tmp');
const PROXY = process.env.HTTPS_PROXY || 'http://127.0.0.1:7897';

// ========== 下载工具 ==========

async function downloadIfMissing(filename: string, url: string): Promise<string> {
  const filepath = path.join(TMP_DIR, filename);
  if (fs.existsSync(filepath) && fs.statSync(filepath).size > 100) {
    console.log(`  ✓ ${filename} 已存在 (${(fs.statSync(filepath).size / 1024).toFixed(0)}KB)`);
    return filepath;
  }
  console.log(`  ↓ 下载 ${filename}...`);
  const resp = await fetch(url, {
    proxy: PROXY,
    signal: AbortSignal.timeout(120_000),
  } as any);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${url}`);
  const buf = await resp.arrayBuffer();
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(filepath, Buffer.from(buf));
  console.log(`  ✓ ${filename} (${(buf.byteLength / 1024).toFixed(0)}KB)`);
  return filepath;
}

// ========== ESConv 导入 ==========

interface ESConvDialog {
  emotion_type: string;
  problem_type: string;
  situation: string;
  survey_score: any;
  dialog: Array<{
    speaker: 'seeker' | 'supporter';
    content: string;
    annotation?: { strategy?: string; feedback?: string };
  }>;
}

async function importESConv() {
  console.log('\n📦 ESConv (Emotional Support Conversation)');
  const filepath = await downloadIfMissing(
    'esconv-raw.json',
    'https://huggingface.co/datasets/thu-coai/esconv/resolve/main/ESConv.json'
  );

  const raw: ESConvDialog[] = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  // 使用 test split: 最后 195 条 (原论文 70/15/15 split)
  const testCases = raw.slice(-195);

  upsertDataset('esconv', 'ESConv (Emotional Support Conversation)', 'en',
    'https://huggingface.co/datasets/thu-coai/esconv');

  let imported = 0;
  for (let i = 0; i < testCases.length; i++) {
    const c = testCases[i];
    const dialog: DialogTurn[] = c.dialog
      .filter(d => d.content?.trim())
      .map(d => ({
        role: d.speaker === 'seeker' ? 'user' as const : 'assistant' as const,
        content: d.content.trim(),
        strategy: d.annotation?.strategy,
      }));

    if (dialog.length < 2) continue;

    insertCase({
      id: `esconv:${1105 + i}`,  // test split starts at index 1105
      datasetId: 'esconv',
      category: c.problem_type,
      emotionType: c.emotion_type,
      situation: c.situation,
      dialog,
      metadata: { survey_score: c.survey_score },
    });
    imported++;
  }

  updateDatasetCount('esconv');
  console.log(`  ✓ 导入 ${imported} 条 (test split)`);
}

// ========== Psy-Insight CN 导入 ==========

interface PsyInsightDialog {
  dialog_id: string;
  psychotherapy: string;
  topic: string;
  stage: string;
  guide: string;
  background: string;
  reasoning: string;
  dialog: Array<{
    speaker: 'Supporter' | 'Seeker';
    participant: string;
    content: string;
    id: string;
    strategy?: string[];
    'emotional label'?: string[];
  }>;
}

async function importPsyInsight() {
  console.log('\n📦 Psy-Insight CN (双语心理咨询)');
  const filepath = await downloadIfMissing(
    'psy-insight-cn.json',
    'https://raw.githubusercontent.com/ckqqqq/Psy-Insight/main/data/cn_data_version7.json'
  );

  const raw: PsyInsightDialog[] = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

  upsertDataset('psy-insight', 'Psy-Insight CN (双语心理咨询)', 'zh',
    'https://github.com/ckqqqq/Psy-Insight');

  let imported = 0;
  for (const c of raw) {
    const dialog: DialogTurn[] = c.dialog
      .filter(d => d.content?.trim())
      .map(d => ({
        role: d.speaker === 'Seeker' ? 'user' as const : 'assistant' as const,
        content: d.content.trim(),
        strategy: d.strategy?.join(','),
        emotion: d['emotional label']?.join(','),
      }));

    if (dialog.length < 2) continue;

    insertCase({
      id: `psy-insight:${c.dialog_id}`,
      datasetId: 'psy-insight',
      category: c.topic,
      psychotherapy: c.psychotherapy,
      situation: c.background,
      dialog,
      metadata: { stage: c.stage, guide: c.guide, reasoning: c.reasoning },
    });
    imported++;
  }

  updateDatasetCount('psy-insight');
  console.log(`  ✓ 导入 ${imported} 条`);
}

// ========== CPsyCounE 导入 ==========

interface CPsyCounEDialog {
  category: string;
  id: string;
  dialog: string[];  // 交替的 "求助者：..." / "支持者：..." 文本
}

async function importCPsyCounE() {
  console.log('\n📦 CPsyCounE (中文心理咨询)');

  // 逐个下载各分类
  const categories = [
    'Career', 'Education', 'Emotion%26Stress', 'Family%20Relationship',
    'Love%26Marriage', 'Mental%20Disease', 'Others',
    'Interpersonal%20Relationship', 'Self-growth',
  ];
  const allDialogs: CPsyCounEDialog[] = [];

  for (const cat of categories) {
    for (let i = 1; i <= 10; i++) {
      const filename = `cpsycoun-${cat}-${i}.json`;
      const url = `https://raw.githubusercontent.com/CAS-SIAT-XinHai/CPsyCoun/main/CPsyCounE/${cat}/${i}.json`;
      try {
        const filepath = await downloadIfMissing(filename, url);
        const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        allDialogs.push({
          category: cat.replace(/%26/g, '&').replace(/%20/g, ' '),
          id: `${cat}-${i}`,
          dialog: data,
        });
      } catch {
        // 有些分类可能不到 10 个
      }
    }
  }

  upsertDataset('cpsycoun', 'CPsyCounE (中文心理咨询)', 'zh',
    'https://github.com/CAS-SIAT-XinHai/CPsyCoun');

  let imported = 0;
  for (const c of allDialogs) {
    const dialog: DialogTurn[] = [];
    for (const line of c.dialog) {
      if (line.startsWith('求助者：') || line.startsWith('求助者:')) {
        dialog.push({ role: 'user', content: line.replace(/^求助者[：:]/, '').trim() });
      } else if (line.startsWith('支持者：') || line.startsWith('支持者:')) {
        dialog.push({ role: 'assistant', content: line.replace(/^支持者[：:]/, '').trim() });
      }
    }
    if (dialog.length < 2) continue;

    insertCase({
      id: `cpsycoun:${c.id}`,
      datasetId: 'cpsycoun',
      category: c.category,
      dialog,
    });
    imported++;
  }

  updateDatasetCount('cpsycoun');
  console.log(`  ✓ 导入 ${imported} 条`);
}

// ========== Adversarial 导入 ==========

async function importAdversarial() {
  console.log('\n📦 Adversarial (对抗性测试集)');

  const dataPath = path.join(__dirname, '../../data/adversarial/adversarial-cases.json');
  if (!fs.existsSync(dataPath)) {
    console.error('  ❌ 文件不存在:', dataPath);
    return;
  }

  const cases = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  upsertDataset('adversarial', 'Adversarial (对抗性测试集)', 'zh', 'local://data/adversarial');

  let imported = 0;
  for (const c of cases) {
    const dialog: DialogTurn[] = c.dialog.map((d: any) => ({
      role: d.role as 'user' | 'assistant',
      content: d.content,
    }));

    if (dialog.length < 1) continue;

    insertCase({
      id: `adversarial:${c.id}`,
      datasetId: 'adversarial',
      category: c.category,
      emotionType: c.emotion_type,
      situation: c.situation,
      dialog,
      metadata: { expectedBehavior: c.expectedBehavior, targetDimensions: c.targetDimensions },
    });
    imported++;
  }

  updateDatasetCount('adversarial');
  console.log(`  ✓ 导入 ${imported} 条对抗性用例`);
}

// ========== 统计 ==========

function showStats() {
  console.log('\n📊 数据集统计\n');
  const datasets = getDatasets();
  if (datasets.length === 0) {
    console.log('  （空）请先运行 prepare.ts 导入数据');
    return;
  }

  console.log('  ┌─────────────┬──────┬──────┬──────────────────────┐');
  console.log('  │ 数据集      │ 语言 │ 用例 │ 来源                 │');
  console.log('  ├─────────────┼──────┼──────┼──────────────────────┤');
  for (const d of datasets) {
    const name = d.id.padEnd(11);
    const lang = d.language.padEnd(4);
    const count = String(d.total_cases).padStart(4);
    const src = (d.source_url || '').slice(0, 20);
    console.log(`  │ ${name} │ ${lang} │ ${count} │ ${src.padEnd(20)} │`);
  }
  console.log('  └─────────────┴──────┴──────┴──────────────────────┘');

  const total = getCaseCount();
  console.log(`\n  总计: ${total} 条评测用例`);

  // DB 文件大小
  const dbPath = path.join(__dirname, 'eval-academic.db');
  if (fs.existsSync(dbPath)) {
    const size = fs.statSync(dbPath).size;
    console.log(`  数据库: ${(size / 1024 / 1024).toFixed(1)}MB`);
  }
}

// ========== 主流程 ==========

async function main() {
  const args = process.argv.slice(2);
  const dataset = args.find(a => a.startsWith('--dataset='))?.split('=')[1]
    || (args.indexOf('--dataset') !== -1 ? args[args.indexOf('--dataset') + 1] : null);
  const statsOnly = args.includes('--stats');

  if (statsOnly) {
    showStats();
    closeDb();
    return;
  }

  console.log('🗂️  学术评测数据集准备');
  console.log(`   代理: ${PROXY}`);

  const importFns: Record<string, () => Promise<void>> = {
    esconv: importESConv,
    'psy-insight': importPsyInsight,
    cpsycoun: importCPsyCounE,
    adversarial: importAdversarial,
  };

  if (dataset) {
    const fn = importFns[dataset];
    if (!fn) {
      console.error(`❌ 未知数据集: ${dataset}`);
      console.error(`   可选: ${Object.keys(importFns).join(', ')}`);
      process.exit(1);
    }
    await fn();
  } else {
    for (const fn of Object.values(importFns)) {
      await fn();
    }
  }

  showStats();
  closeDb();
  console.log('\n✅ 数据准备完成');
}

main().catch(err => {
  console.error('Fatal:', err);
  closeDb();
  process.exit(1);
});
