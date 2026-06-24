#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const trackedFiles = [
  ...new Set(
    execFileSync('git', ['ls-files', '--cached', '--modified', '--others', '--exclude-standard'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean),
  ),
];

const findings = [];

function addFinding(level, file, detail) {
  findings.push({ level, file, detail });
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function isAllowedPlaceholder(file, line) {
  return (
    file === 'env.example' ||
    file.startsWith('docs/') ||
    /your_|placeholder|example|sk-lf-\.\.\.|pk-lf-\.\.\.|postgresql:\/\/\.\.\.|DEEPSEEK_API_KEY=/.test(line)
  );
}

for (const file of trackedFiles) {
  if (
    file.startsWith('node_modules/') ||
    file.startsWith('.next/') ||
    file.endsWith('.png') ||
    file.endsWith('.ico') ||
    file.endsWith('.wasm')
  ) {
    continue;
  }

  if (/(^|\/)\.env($|\.)/.test(file)) {
    addFinding('high', file, 'tracked env-like file');
    continue;
  }

  let content = '';
  try {
    content = read(file);
  } catch {
    continue;
  }

  content.split(/\r?\n/).forEach((line, index) => {
    if (isAllowedPlaceholder(file, line)) return;

    if (/postgres(?:ql)?:\/\/[^/:\s"'`]+:[^@\s"'`]+@/i.test(line)) {
      addFinding('high', file, `hardcoded postgres credential at line ${index + 1}`);
    }

    if (
      /(API_KEY|SECRET|TOKEN|PASSWORD)\b/i.test(line) &&
      !line.includes('${process.env.') &&
      /(?:const|let|var|export\s+const)\s+[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\s*=\s*(?:process\.env\.[A-Z0-9_]+\s*\|\|\s*)?['"`][^'"`]{16,}['"`]/i.test(line)
    ) {
      addFinding('high', file, `hardcoded secret-like fallback at line ${index + 1}`);
    }
  });
}

const forbiddenArtifactFiles = [];
walkArtifact(path.join(root, '.next', 'standalone'), (file) => {
  const relative = path.relative(root, file);
  const basename = path.basename(file);
  if (basename === '.env' || basename.startsWith('.env.')) {
    forbiddenArtifactFiles.push(relative);
    return;
  }

  if (relative === path.join('.next', 'standalone', 'scripts', 'migrate-to-singapore.js')) {
    const content = fs.readFileSync(file, 'utf8');
    if (/postgres(?:ql)?:\/\/[^/:\s"'`]+:[^@\s"'`]+@/i.test(content)) {
      forbiddenArtifactFiles.push(relative);
    }
  }
});

for (const file of forbiddenArtifactFiles) {
  addFinding('high', file, 'secret-bearing standalone artifact; run scripts/scrub-standalone-secrets.mjs');
}

const evalRoutes = trackedFiles
  .filter((file) => file.startsWith('app/api/eval/') && file.endsWith('/route.ts'))
  .filter((file) => !file.endsWith('/auth-guard.ts'));

for (const file of evalRoutes) {
  const content = read(file);
  const hasHandler = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)/.test(content);
  const hasGuard = /requireEval(Auth|Admin)\s*\(/.test(content);
  if (hasHandler && !hasGuard) {
    addFinding('medium', file, 'eval route missing requireEvalAuth/requireEvalAdmin');
  }
}

for (const finding of findings) {
  console.log(`[${finding.level}] ${finding.file}: ${finding.detail}`);
}

if (findings.some((finding) => finding.level === 'high')) {
  process.exitCode = 1;
} else if (findings.length > 0) {
  process.exitCode = 1;
} else {
  console.log('security audit passed');
}

function walkArtifact(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    onFile(dir);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(dir)) {
    walkArtifact(path.join(dir, entry), onFile);
  }
}
