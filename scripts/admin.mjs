#!/usr/bin/env node
// Admin API client. Reads URL + ADMIN token from .env.local or the environment and never prints the token.
// Usage: node scripts/admin.mjs <dev|prod> <action> [json-payload | @file.json]
//   node scripts/admin.mjs dev listUntagged
//   node scripts/admin.mjs dev setTags '{"updates":[{"id":"c_1","tags":["food"]}]}'
//   node scripts/admin.mjs dev appendInbox @/tmp/rows.json
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** .env.local (optional, local use) overridden by the process environment (GitHub Actions secrets). */
export function loadEnv() {
  const env = {};
  if (existsSync(join(root, '.env.local'))) {
    for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (/^(API_URL|ADMIN_TOKEN)_/.test(k) && v) env[k] = v;
  return env;
}

export async function call(envName, action, payload = {}, { role = 'admin' } = {}) {
  const env = loadEnv();
  const E = envName.toUpperCase();
  const url = env[`API_URL_${E}`];
  const token = env[`${role === 'admin' ? 'ADMIN' : 'LEARNER'}_TOKEN_${E}`];
  if (!url || !token) throw new Error(`API_URL_${E} or token missing (.env.local or environment)`);
  const body = JSON.stringify({ ...payload, action, token });
  let lastErr;
  // Every action is idempotent, so a lost/garbled round-trip is simply retried.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 500 * attempt));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'manual'
      });
      // Apps Script answers POST with a 302 to a one-time URL that must be fetched with GET.
      const loc = res.headers.get('location');
      const final = loc ? await fetch(loc, { redirect: 'manual' }) : res;
      const text = await final.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        lastErr = new Error(`Non-JSON response (HTTP ${final.status}): ${text.slice(0, 120).replaceAll(token, '***')}`);
        continue;
      }
      if (json.error === 'no_action' || json.error === 'busy') {
        lastErr = new Error(json.error);
        continue;
      }
      return json;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [envName, action, arg] = process.argv.slice(2);
  if (!envName || !action) {
    console.error('usage: node scripts/admin.mjs <dev|prod> <action> [json | @file]');
    process.exit(2);
  }
  const payload = arg ? JSON.parse(arg.startsWith('@') ? readFileSync(arg.slice(1), 'utf8') : arg) : {};
  const out = await call(envName, action, payload);
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}
