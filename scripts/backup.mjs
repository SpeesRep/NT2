#!/usr/bin/env node
// Backs up the learner's progress (Log + Progress tabs) before any PROD change.
// Writes backups/<env>-<timestamp>.json (git-ignored: it is the learner's data) and prints counts.
// Usage: node scripts/backup.mjs prod
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { call } from './admin.mjs';

const env = process.argv[2] || 'prod';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = { env, at: new Date().toISOString(), tabs: {} };
for (const tab of ['Log', 'Progress', 'Cards']) {
  const res = await call(env, 'readTab', { tab });
  if (!res.ok) throw new Error(`${tab}: ${res.error} ${res.message ?? ''}`);
  out.tabs[tab] = res.values;
}
const counts = Object.fromEntries(Object.entries(out.tabs).map(([k, v]) => [k, Math.max(0, v.length - 1)]));
mkdirSync(join(root, 'backups'), { recursive: true });
const file = join(root, 'backups', `${env}-${out.at.replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(out));
console.log(JSON.stringify({ file: file.replace(root + '/', ''), counts }));
