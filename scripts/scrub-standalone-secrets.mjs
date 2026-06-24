#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const standaloneDir = path.join(process.cwd(), '.next', 'standalone');

function removeIfExists(file) {
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file, { force: true });
  return true;
}

function walk(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    onFile(dir);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(dir)) {
    walk(path.join(dir, entry), onFile);
  }
}

let removed = 0;

walk(standaloneDir, (file) => {
  const basename = path.basename(file);
  if (basename === '.env' || basename.startsWith('.env.')) {
    if (removeIfExists(file)) removed += 1;
  }
});

const legacyMigrationScript = path.join(standaloneDir, 'scripts', 'migrate-to-singapore.js');
if (fs.existsSync(legacyMigrationScript)) {
  const content = fs.readFileSync(legacyMigrationScript, 'utf8');
  if (/postgres(?:ql)?:\/\/[^/:\s"'`]+:[^@\s"'`]+@/i.test(content)) {
    if (removeIfExists(legacyMigrationScript)) removed += 1;
  }
}

console.log(`scrubbed standalone secret artifacts: ${removed}`);
