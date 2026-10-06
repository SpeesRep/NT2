#!/usr/bin/env node
// Builds content.json for one environment from the Apps Script (admin action `content`) and validates it.
// Usage: node scripts/build-content.mjs <dev|prod> <out.json>
//   Needs API_URL_<ENV> and ADMIN_TOKEN_<ENV> (GitHub secrets in the content Action, or .env.local).
//   Writes the file only when the content changed (same `version` = nothing to publish); prints `changed=true|false`.
// The file is the app's ONLY data source: the app fetches it from its own origin and sends nothing back.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { call } from './admin.mjs';

/** Lower-case letters and digits only, for comparing an id with its word. */
const slug = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Ids made by the Apps Script (newId_): random, so never compared with words. */
const RANDOM_ID = /^c_[0-9a-f]{10}$/;
/** The card's words of 3+ letters (Dutch, French, answer), as slugs. */
const words = (c) =>
  [c.nl, c.fr, c.answer].flatMap((t) => String(t ?? '').split(/[^\p{L}\p{N}]+/u)).map(slug).filter((w) => w.length >= 3);

/**
 * Card ids must be stable and never derived from the word: they key the learner's progress on her device.
 * Returns a list of problems (empty = fine).
 */
export function checkIds(cards) {
  const problems = [];
  const seen = new Set();
  for (const c of cards) {
    const id = String(c.id ?? '');
    if (!id) problems.push(`card without id: ${c.nl}`);
    else if (!/^[A-Za-z0-9_-]{2,40}$/.test(id)) problems.push(`bad id "${id}" (${c.nl})`);
    else if (seen.has(id)) problems.push(`duplicate id ${id}`);
    else if (!RANDOM_ID.test(id) && words(c).some((w) => slug(id).includes(w))) {
      problems.push(`id "${id}" looks derived from the word "${c.nl}"`);
    }
    seen.add(id);
  }
  return problems;
}

/** Only what the app needs; `version` = hash of that content, so it changes only when the word list changes. */
export function toContent(env, res) {
  const body = { cards: res.cards, settings: res.settings, tags: res.tags, curriculum: res.curriculum ?? [] };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  return { format: 1, version, env: env.toUpperCase(), generated_at: new Date().toISOString(), ...body };
}

/** Ids published before that are gone now: their progress on devices is orphaned (a warning, not an error). */
export function lostIds(previous, next) {
  const now = new Set(next.cards.map((c) => c.id));
  return (previous?.cards ?? []).filter((c) => !now.has(c.id)).map((c) => `${c.id} (${c.nl})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [env, out] = process.argv.slice(2);
  if (!/^(dev|prod)$/.test(env ?? '') || !out) {
    console.error('usage: node scripts/build-content.mjs <dev|prod> <out.json>');
    process.exit(2);
  }
  const res = await call(env, 'content');
  if (!res.ok) throw new Error(`content: ${res.error} ${res.message ?? ''}`);
  if (res.env !== env.toUpperCase()) throw new Error(`the ${env} API answered as ${res.env}`);
  if (!Array.isArray(res.cards) || res.cards.length === 0) throw new Error('no cards — refusing to publish an empty word list');
  const problems = checkIds(res.cards);
  if (problems.length) {
    console.error(problems.join('\n'));
    throw new Error(`${problems.length} card id problem(s) — fix them in the sheet`);
  }
  const content = toContent(env, res);
  const previous = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  const lost = lostIds(previous, content);
  if (lost.length) console.log(`::warning::${lost.length} card(s) no longer published: ${lost.slice(0, 20).join(', ')}`);
  const changed = previous?.version !== content.version;
  if (changed) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(content) + '\n');
  }
  console.log(`${env}: ${content.cards.length} cards, version ${content.version}${changed ? ' (new)' : ' (unchanged)'}`);
  console.log(`changed=${changed}`);
}
