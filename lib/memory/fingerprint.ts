import type { MemoryKind } from './v2-types';

function normalizeText(text: string): string {
  return text
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (text.includes(pattern)) return pattern;
  }
  return null;
}

export function buildMemoryFingerprint(kind: MemoryKind, content: string): string {
  const normalized = normalizeText(content);

  if (kind === 'trigger') {
    const subject =
      hasAny(normalized, ['工作汇报', '汇报', '上班', '领导', '批评', '工作']) || 'generic';
    const symptom =
      hasAny(normalized, ['胸口发紧', '焦虑', '紧张', '害怕', '被批评']) || 'generic';
    return `${kind}:${subject}:${symptom}`;
  }

  if (kind === 'preference') {
    const avoid =
      hasAny(normalized, ['强势', '命令式', '一步步命令', '推动']) || 'generic';
    const prefer =
      hasAny(normalized, ['陪伴', '理清思路', '梳理', '先被理解']) || 'generic';
    return `${kind}:${avoid}:${prefer}`;
  }

  if (kind === 'coping') {
    const coping =
      hasAny(normalized, ['呼吸', '写下来', '散步', '冥想', '梳理']) || 'generic';
    return `${kind}:${coping}`;
  }

  if (kind === 'relationship') {
    const target =
      hasAny(normalized, ['妈妈', '爸爸', '领导', '伴侣', '同事', '朋友']) || 'generic';
    return `${kind}:${target}`;
  }

  const core = normalized.slice(0, 40) || 'generic';
  return `${kind}:${core}`;
}
