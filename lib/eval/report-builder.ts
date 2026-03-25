/**
 * 评测报告生成器
 *
 * 生成独立的 HTML 报告文件（内联 CSS，无外部依赖）。
 * 包含：概览卡片、等级分布柱状图、维度雷达图（纯 SVG）、高频问题 Top 10、评估明细表。
 */

import type { EvalRow } from './eval-store';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface ReportOptions {
  title?: string;
  dateRange: { from: Date; to: Date };
  evals: EvalRow[];
  conversationTitles?: Map<string, string | null>;
}

export interface ReportData {
  totalEvals: number;
  avgOverallScore: number;
  gradeDistribution: Record<string, number>;
  dimensionAvg: { legal: number; ethical: number; professional: number; ux: number };
  passRate: number;
  topIssues: Array<{ issue: string; count: number }>;
}

// --------------------------------------------------------------------------
// 数据构建
// --------------------------------------------------------------------------

export function buildReportData(evals: EvalRow[]): ReportData {
  const total = evals.length;

  if (total === 0) {
    return {
      totalEvals: 0,
      avgOverallScore: 0,
      gradeDistribution: {},
      dimensionAvg: { legal: 0, ethical: 0, professional: 0, ux: 0 },
      passRate: 0,
      topIssues: [],
    };
  }

  // 平均总分
  const avgOverallScore =
    Math.round((evals.reduce((s, e) => s + e.overallScore, 0) / total) * 10) / 10;

  // 等级分布
  const gradeDistribution: Record<string, number> = {};
  for (const e of evals) {
    gradeDistribution[e.overallGrade] = (gradeDistribution[e.overallGrade] || 0) + 1;
  }

  // 维度平均分
  const dimensionAvg = {
    legal: Math.round((evals.reduce((s, e) => s + e.legalScore, 0) / total) * 10) / 10,
    ethical: Math.round((evals.reduce((s, e) => s + e.ethicalScore, 0) / total) * 10) / 10,
    professional: Math.round((evals.reduce((s, e) => s + e.professionalScore, 0) / total) * 10) / 10,
    ux: Math.round((evals.reduce((s, e) => s + e.uxScore, 0) / total) * 10) / 10,
  };

  // 通过率（overallGrade 为 PASS 或 A/B 视为通过）
  const passGrades = new Set(['PASS', 'A', 'B']);
  const passCount = evals.filter((e) => passGrades.has(e.overallGrade)).length;
  const passRate = Math.round((passCount / total) * 1000) / 10;

  // 高频问题 Top 10
  const issueCounter = new Map<string, number>();
  for (const e of evals) {
    const allIssues = [
      ...e.legalIssues,
      ...e.ethicalIssues,
      ...e.professionalIssues,
      ...e.uxIssues,
    ];
    for (const issue of allIssues) {
      if (issue.trim()) {
        issueCounter.set(issue, (issueCounter.get(issue) || 0) + 1);
      }
    }
  }
  const topIssues = Array.from(issueCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([issue, count]) => ({ issue, count }));

  return { totalEvals: total, avgOverallScore, gradeDistribution, dimensionAvg, passRate, topIssues };
}

// --------------------------------------------------------------------------
// SVG 雷达图生成（纯字符串拼接，参考 DimensionRadar 算法）
// --------------------------------------------------------------------------

function generateRadarSvg(dims: ReportData['dimensionAvg']): string {
  const labels = [
    { key: 'legal', label: '法律合规' },
    { key: 'ethical', label: '伦理安全' },
    { key: 'professional', label: '专业水平' },
    { key: 'ux', label: '用户体验' },
  ] as const;

  const cx = 150;
  const cy = 150;
  const maxR = 110;
  const levels = 5;
  const n = labels.length;

  // 刻度网格
  let gridLines = '';
  for (let l = 1; l <= levels; l++) {
    const r = (maxR * l) / levels;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    gridLines += `<polygon points="${pts.join(' ')}" fill="none" stroke="#e5e7eb" stroke-width="1"/>\n`;
  }

  // 轴线
  let axisLines = '';
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${cx + maxR * Math.cos(angle)}" y2="${cy + maxR * Math.sin(angle)}" stroke="#d1d5db" stroke-width="1"/>\n`;
  }

  // 数据多边形
  const values = labels.map((l) => dims[l.key]);
  const dataPts = values.map((v, i) => {
    const ratio = Math.min(v / 10, 1);
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return `${cx + maxR * ratio * Math.cos(angle)},${cy + maxR * ratio * Math.sin(angle)}`;
  });

  // 标签
  let labelTexts = '';
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const lr = maxR + 28;
    const lx = cx + lr * Math.cos(angle);
    const ly = cy + lr * Math.sin(angle);
    const anchor = Math.abs(Math.cos(angle)) < 0.01 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
    labelTexts += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="central" fill="#374151" font-size="13" font-weight="500">${labels[i].label} (${values[i]})</text>\n`;
  }

  return `<svg viewBox="0 0 300 300" width="300" height="300" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">
  ${gridLines}
  ${axisLines}
  <polygon points="${dataPts.join(' ')}" fill="rgba(99,102,241,0.2)" stroke="#6366f1" stroke-width="2"/>
  ${dataPts.map((pt) => `<circle cx="${pt.split(',')[0]}" cy="${pt.split(',')[1]}" r="4" fill="#6366f1"/>`).join('\n  ')}
  ${labelTexts}
</svg>`;
}

// --------------------------------------------------------------------------
// HTML 报告生成
// --------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#16a34a';
    case 'B': return '#65a30d';
    case 'C': return '#ca8a04';
    case 'D': return '#ea580c';
    case 'F': return '#dc2626';
    case 'PASS': return '#16a34a';
    case 'WARN': return '#ca8a04';
    case 'FAIL': return '#dc2626';
    default: return '#6b7280';
  }
}

export function generateReportHtml(data: ReportData, options: ReportOptions): string {
  const title = options.title || '评测报告';
  const now = new Date();
  const fromStr = formatDate(options.dateRange.from);
  const toStr = formatDate(options.dateRange.to);
  const titleMap = options.conversationTitles || new Map();

  // 等级分布柱状图 HTML
  const gradeOrder = ['A', 'B', 'C', 'D', 'F', 'PASS', 'WARN', 'FAIL'];
  const presentGrades = gradeOrder.filter((g) => (data.gradeDistribution[g] || 0) > 0);
  // 如果有其他等级不在预定义列表中
  for (const g of Object.keys(data.gradeDistribution)) {
    if (!presentGrades.includes(g)) presentGrades.push(g);
  }
  const maxGradeCount = Math.max(...Object.values(data.gradeDistribution), 1);

  const gradeBarHtml = presentGrades
    .map((g) => {
      const count = data.gradeDistribution[g] || 0;
      const pct = Math.round((count / maxGradeCount) * 100);
      const color = gradeColor(g);
      return `<div class="bar-row">
        <span class="bar-label">${escapeHtml(g)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="bar-value">${count}</span>
      </div>`;
    })
    .join('\n');

  // 高频问题表格
  const issueRows = data.topIssues
    .map(
      (item, idx) =>
        `<tr><td>${idx + 1}</td><td>${escapeHtml(item.issue)}</td><td>${item.count}</td></tr>`
    )
    .join('\n');

  // 评估明细表
  const detailRows = options.evals
    .map((e) => {
      const convTitle = titleMap.get(e.conversationId) || '未命名';
      return `<tr>
        <td class="id-cell" title="${escapeHtml(e.id)}">${escapeHtml(e.id.slice(0, 8))}</td>
        <td>${escapeHtml(convTitle)}</td>
        <td>${e.overallScore}</td>
        <td><span class="grade-badge" style="background:${gradeColor(e.overallGrade)}">${escapeHtml(e.overallGrade)}</span></td>
        <td>${e.legalScore}</td>
        <td>${e.ethicalScore}</td>
        <td>${e.professionalScore}</td>
        <td>${e.uxScore}</td>
        <td>${formatDateTime(e.evaluatedAt)}</td>
      </tr>`;
    })
    .join('\n');

  // 雷达图 SVG
  const radarSvg = generateRadarSvg(data.dimensionAvg);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --color-primary: #6366f1;
    --color-success: #16a34a;
    --color-warning: #ca8a04;
    --color-danger: #dc2626;
    --color-bg: #f9fafb;
    --color-card: #ffffff;
    --color-border: #e5e7eb;
    --color-text: #111827;
    --color-text-secondary: #6b7280;
    --radius: 12px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: var(--color-bg);
    color: var(--color-text);
    line-height: 1.6;
    padding: 32px 24px;
  }
  .container { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
  .subtitle { color: var(--color-text-secondary); font-size: 14px; margin-bottom: 32px; }

  /* 概览卡片 */
  .overview { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
  .card {
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 20px 24px;
  }
  .card-label { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 4px; }
  .card-value { font-size: 32px; font-weight: 700; }
  .card-value.score { color: var(--color-primary); }
  .card-value.pass { color: var(--color-success); }

  /* 两列布局 */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }

  /* 柱状图 */
  .section-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
  .bar-row { display: flex; align-items: center; margin-bottom: 8px; }
  .bar-label { width: 48px; font-size: 14px; font-weight: 600; text-align: center; }
  .bar-track { flex: 1; height: 24px; background: #f3f4f6; border-radius: 6px; overflow: hidden; margin: 0 12px; }
  .bar-fill { height: 100%; border-radius: 6px; transition: width 0.3s; }
  .bar-value { width: 36px; font-size: 14px; text-align: right; color: var(--color-text-secondary); }

  /* 表格 */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--color-border); }
  th { background: #f9fafb; font-weight: 600; color: var(--color-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }
  tr:hover td { background: #f3f4f6; }
  .id-cell { font-family: monospace; font-size: 12px; color: var(--color-text-secondary); }
  .grade-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 9999px;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
  }

  /* 高频问题 */
  .issues-section { margin-bottom: 32px; }

  /* 明细表滚动 */
  .detail-section { margin-bottom: 32px; }
  .table-wrapper { overflow-x: auto; }

  /* 打印 */
  @media print {
    body { background: #fff; padding: 16px; }
    .container { max-width: 100%; }
    .card { break-inside: avoid; }
    .two-col { break-inside: avoid; }
    .detail-section table { font-size: 11px; }
    th, td { padding: 4px 8px; }
  }
</style>
</head>
<body>
<div class="container">

  <h1>${escapeHtml(title)}</h1>
  <p class="subtitle">
    生成时间：${formatDateTime(now)} &nbsp;|&nbsp;
    数据范围：${fromStr} ~ ${toStr} &nbsp;|&nbsp;
    共 ${data.totalEvals} 条评估
  </p>

  <!-- 概览卡片 -->
  <div class="overview">
    <div class="card">
      <div class="card-label">总评估数</div>
      <div class="card-value">${data.totalEvals}</div>
    </div>
    <div class="card">
      <div class="card-label">平均分</div>
      <div class="card-value score">${data.avgOverallScore}</div>
    </div>
    <div class="card">
      <div class="card-label">通过率</div>
      <div class="card-value pass">${data.passRate}%</div>
    </div>
  </div>

  <!-- 等级分布 + 维度雷达图 -->
  <div class="two-col">
    <div class="card">
      <div class="section-title">等级分布</div>
      ${gradeBarHtml || '<p style="color:var(--color-text-secondary)">暂无数据</p>'}
    </div>
    <div class="card" style="text-align:center;">
      <div class="section-title">维度雷达图</div>
      ${radarSvg}
    </div>
  </div>

  <!-- 高频问题 Top 10 -->
  <div class="issues-section card">
    <div class="section-title">高频问题 Top 10</div>
    ${
      data.topIssues.length > 0
        ? `<table>
      <thead><tr><th>#</th><th>问题描述</th><th>出现次数</th></tr></thead>
      <tbody>${issueRows}</tbody>
    </table>`
        : '<p style="color:var(--color-text-secondary);margin-top:8px;">暂无问题记录</p>'
    }
  </div>

  <!-- 评估明细 -->
  <div class="detail-section card">
    <div class="section-title">评估明细</div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>对话标题</th>
            <th>总分</th>
            <th>等级</th>
            <th>法律</th>
            <th>伦理</th>
            <th>专业</th>
            <th>体验</th>
            <th>评估时间</th>
          </tr>
        </thead>
        <tbody>${detailRows || '<tr><td colspan="9" style="text-align:center;color:var(--color-text-secondary)">暂无数据</td></tr>'}</tbody>
      </table>
    </div>
  </div>

</div>
</body>
</html>`;
}
