#!/usr/bin/env node
// Lists emoji/picture cards in Cards AND the Inbox of a sheet that have no OpenMoji picture in the app (src/openmoji.ts).
// A picture front = an emoji, a regional-indicator letter, an OpenMoji private-use code point or "openmoji:E0C0".
// Usage: npm run openmoji:check -- dev|prod   (exit code 1 when something is missing)
import { readFileSync } from 'node:fs';
import { call } from './admin.mjs';

const env = process.argv[2] || 'dev';
const om = readFileSync(new URL('../src/openmoji.ts', import.meta.url), 'utf8');
const keys = new Set([...om.matchAll(/^ {2}"([^"]+)": '/gm)].map((m) => JSON.parse(`"${m[1]}"`)));
const strip = (s) => s.replace(/️/g, '');
const loose = new Set([...keys].map(strip));
const isPicture = (t) => /^openmoji:/i.test(t) || (t !== '' && /^[\p{Extended_Pictographic}\p{Regional_Indicator}\u{E000}-\u{F8FF}‍️\u{1F3FB}-\u{1F3FF}]+$/u.test(t));
const has = (t) => (/^openmoji:/i.test(t) ? keys.has('openmoji:' + t.slice(9).toUpperCase()) : keys.has(t) || loose.has(strip(t)));

let missing = 0, total = 0;
for (const tab of ['Cards', 'Inbox']) {
  const r = await call(env, 'readTab', { tab });
  const [h, ...rows] = r.values;
  for (const c of rows.map((v) => Object.fromEntries(h.map((k, i) => [k, v[i]])))) {
    const t = String(c.nl ?? '').trim();
    if (!isPicture(t)) continue;
    total++;
    if (!has(t)) { missing++; console.log(`${tab} ${c.id} ${JSON.stringify(t)} → ${c.answer}: no OpenMoji picture`); }
  }
}
console.log(`${env.toUpperCase()}: ${total} picture cards, ${missing} without a picture.`);
process.exit(missing ? 1 : 0);
