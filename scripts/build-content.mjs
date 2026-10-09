#!/usr/bin/env node
// Writes every group's word list into the site being deployed (spec › Publishing). Nothing is committed.
// Usage: node scripts/build-content.mjs <dev|prod> <siteDir>
//   Calls the API action `export` with EXPORT_KEY_<ENV> (read-only; GitHub secret) and API_URL_<ENV>.
//   Writes <siteDir>/g/<code>/content.json per group (inactive group: {format, code, active:false}).
//   Refuses to publish when the export looks wrong (bad ids, bad codes, an active group's env mismatch) — the
//   deploy then fails and the live site keeps the previous files.
// The files are the student app's ONLY data source: fetched from its own origin, nothing is sent back.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { call } from './admin.mjs';

/** Lower-case letters and digits only, for comparing an id with its word. */
const slug = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Ids made by the Apps Script (newId_): random, so never compared with words. */
const RANDOM_ID = /^c_[0-9a-f]{10}$/;
const GROUP_CODE = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;
/** The card's words of 3+ letters (Dutch, French, answer), as slugs. */
const words = (c) =>
  [c.nl, c.fr, c.answer].flatMap((t) => String(t ?? '').split(/[^\p{L}\p{N}]+/u)).map(slug).filter((w) => w.length >= 3);

/**
 * Card ids must be stable and never derived from the word: they key the learner's progress on the device.
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

/** One group's content.json. `version` = hash of the content only, so it changes only when the word list does. */
export function toContent(env, g) {
  if (!g.active) return { format: 1, code: g.code, active: false };
  const body = { display_name: g.display_name, languages: g.languages, cards: g.cards, settings: g.settings, tags: g.tags,
    curriculum: g.curriculum ?? [] };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  return { format: 1, code: g.code, active: true, version, env: env.toUpperCase(), ...body };
}

/** Problems that must stop the publish (empty = fine). */
export function checkExport(env, res) {
  const problems = [];
  if (res.env !== env.toUpperCase()) problems.push(`the ${env} API answered as ${res.env}`);
  if (!Array.isArray(res.groups)) return problems.concat('no groups[]');
  const codes = new Set();
  for (const g of res.groups) {
    if (!GROUP_CODE.test(String(g.code))) problems.push(`bad group code "${g.code}"`);
    if (codes.has(g.code)) problems.push(`duplicate group code ${g.code}`);
    codes.add(g.code);
    if (g.active) checkIds(g.cards ?? []).forEach((p) => problems.push(`${g.code}: ${p}`));
  }
  return problems;
}

/** Ids in the live file that are gone now: their progress on devices is orphaned (a warning, not an error). */
export function lostIds(previous, next) {
  if (!previous?.cards || !next?.cards) return [];
  const now = new Set(next.cards.map((c) => c.id));
  return previous.cards.filter((c) => !now.has(c.id)).map((c) => `${c.id} (${c.nl})`);
}

/** The live file of a group (for the lost-ids warning), or null. */
async function liveFile(env, code) {
  const base = env === 'prod' ? 'https://speesrep.github.io/NT2/' : 'https://speesrep.github.io/NT2/dev/';
  try {
    const r = await fetch(`${base}g/${code}/content.json`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [env, site] = process.argv.slice(2);
  if (!/^(dev|prod)$/.test(env ?? '') || !site) {
    console.error('usage: node scripts/build-content.mjs <dev|prod> <siteDir>');
    process.exit(2);
  }
  const res = await call(env, 'export', {}, { keyName: process.env[`EXPORT_KEY_${env.toUpperCase()}`] ? 'EXPORT_KEY' : 'ADMIN_KEY' });
  if (!res.ok) throw new Error(`export: ${res.error} ${res.message ?? ''}`);
  const problems = checkExport(env, res);
  if (problems.length) {
    console.error(problems.join('\n'));
    throw new Error(`${problems.length} problem(s) in the ${env} export — nothing published`);
  }
  for (const g of res.groups) {
    const content = toContent(env, g);
    const dir = join(site, 'g', g.code);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'content.json'), JSON.stringify(content) + '\n');
    const lost = content.active ? lostIds(await liveFile(env, g.code), content) : [];
    if (lost.length) console.log(`::warning::${env} ${g.code}: ${lost.length} card(s) no longer published: ${lost.slice(0, 20).join(', ')}`);
    if (content.active && !content.cards.length) console.log(`::warning::${env} ${g.code}: no cards yet`);
    console.log(`${env} ${g.code}: ${content.active ? `${content.cards.length} cards, version ${content.version}` : 'inactive'}`);
  }
  // TRANSITIONAL until the app knows group codes (spec phase 4, which removes this): the first active group's list
  // also at <site>/content.json, where the current app looks for it.
  const first = res.groups.find((g) => g.active);
  if (first) writeFileSync(join(site, 'content.json'), JSON.stringify(toContent(env, first)) + '\n');
}
