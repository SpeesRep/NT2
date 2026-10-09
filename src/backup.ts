import { NS } from './config';
import { db, type Meta, type ReviewEvent, type StudentFlag } from './db';
import type { Progress } from './scheduler';
import { cleanUserSettings } from './userSettings';
import { localDate } from './session';

// The learner's own JSON backup ("Instellingen" › Back-up): everything that exists only on this device. Cards are
// not in it (they come from content.json). It never leaves the device unless the learner shares the file.

export type Backup = {
  app: 'speesrep';
  version: 1;
  ns: string; // speesrep-dev / speesrep-prod: a backup only goes back into the same app
  exported_at: string;
  progress: Progress[];
  queue?: ReviewEvent[]; // Fanki-era outbox; SpeesRep neither writes nor reads it
  flags: StudentFlag[];
  meta: Partial<Pick<Meta, 'intro' | 'doneToday' | 'dayCounts' | 'studyTags' | 'userSettings' | 'curriculumOpened' | 'groupCode' | 'helpLang'>>;
};

const META_KEYS = ['intro', 'doneToday', 'dayCounts', 'studyTags', 'userSettings', 'curriculumOpened', 'groupCode', 'helpLang'] as const;

export async function exportBackup(now = new Date()): Promise<Backup> {
  const d = await db();
  const meta: Backup['meta'] = {};
  for (const k of META_KEYS) {
    const row = await d.get('meta', k);
    if (row) (meta as Record<string, unknown>)[k] = row.value;
  }
  return {
    app: 'speesrep',
    version: 1,
    ns: NS,
    exported_at: now.toISOString(),
    progress: await d.getAll('progress'),
    flags: await d.getAll('flags'),
    meta
  };
}

export class BackupError extends Error {}

/** Larger files are refused before parsing (a backup of thousands of cards is well under 1 MB). */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const TRACKS = new Set(['recog', 'prod']);
const STATES = new Set(['New', 'Learning', 'Review', 'Relearning']);
const isTime = (v: unknown) => typeof v === 'string' && !isNaN(Date.parse(v));
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** One FSRS record as the app itself writes it (key = card|track, valid dates, finite numbers). */
export function validProgress(p: unknown): p is Progress {
  const r = p as Partial<Progress> | null;
  return (
    !!r && typeof r.card_id === 'string' && !!r.card_id && TRACKS.has(String(r.track)) && r.key === `${r.card_id}|${r.track}` &&
    STATES.has(String(r.state)) && isTime(r.due) && (r.last_review === '' || isTime(r.last_review)) &&
    [r.stability, r.difficulty, r.reps, r.lapses, r.learning_steps, r.scheduled_days].every(isNum)
  );
}

export function validFlag(f: unknown): f is StudentFlag {
  const r = f as Partial<StudentFlag> | null;
  return !!r && typeof r.id === 'string' && !!r.id && typeof r.card_id === 'string' && !!r.card_id && isTime(r.ts) &&
    typeof r.resolved === 'boolean' && isTime(r.updated_ts) && typeof (r.note ?? '') === 'string';
}

/**
 * Checks a parsed file; throws BackupError('bad' | 'otherApp') when it can't go back into this app. Records that
 * are not valid are left out (`skipped`); a file with records but none valid is 'bad'.
 */
export function checkBackup(raw: unknown): Backup & { skipped: number } {
  const b = raw as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.app !== 'speesrep' || b.version !== 1 || !Array.isArray(b.progress) || !Array.isArray(b.flags)) {
    throw new BackupError('bad');
  }
  if (b.ns !== NS) throw new BackupError('otherApp');
  const progress = b.progress.filter(validProgress);
  const flags = b.flags.filter(validFlag);
  const skipped = b.progress.length - progress.length + (b.flags.length - flags.length);
  if (skipped && !progress.length && !flags.length) throw new BackupError('bad');
  const meta = b.meta && typeof b.meta === 'object' ? b.meta : {};
  return { ...(b as Backup), progress, flags, meta, skipped };
}

/** Parses the chosen file (size limit, JSON) and checks it. */
export async function readBackupFile(file: Blob): Promise<Backup & { skipped: number }> {
  if (file.size > MAX_BACKUP_BYTES) throw new BackupError('bad');
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new BackupError('bad');
  }
  return checkBackup(raw);
}

/** What an import would do to this device: records it adds, replaces (the file is newer) and keeps (ours is newer). */
export async function previewBackup(raw: unknown): Promise<{ add: number; replace: number; keep: number; skipped: number }> {
  const b = checkBackup(raw);
  const d = await db();
  const out = { add: 0, replace: 0, keep: 0, skipped: b.skipped };
  for (const p of b.progress) {
    const cur = await d.get('progress', p.key);
    if (!cur) out.add++;
    else if ((p.last_review || '') > (cur.last_review || '')) out.replace++;
    else out.keep++;
  }
  return out;
}

/**
 * Puts a backup back, MERGING with what is on the device: progress and 🚩 flags keep the newer record (the screen
 * asks first when the file would replace records, `previewBackup`), reviews per day keep the higher count, the
 * learner's settings and topic choice are restored, today's records only when the backup is from today.
 * Invalid records are skipped (`checkBackup`). One transaction: all or nothing.
 */
export async function importBackup(raw: unknown, now = new Date()): Promise<{ progress: number; flags: number }> {
  const b = checkBackup(raw);
  const d = await db();
  const tx = d.transaction(['progress', 'flags', 'meta'], 'readwrite');
  const count = { progress: 0, flags: 0 };
  for (const p of b.progress) {
    const cur = await tx.objectStore('progress').get(p.key);
    if (!cur || (p.last_review || '') > (cur.last_review || '')) {
      await tx.objectStore('progress').put(p);
      count.progress++;
    }
  }
  for (const f of b.flags) {
    const cur = await tx.objectStore('flags').get(f.id);
    if (!cur || (f.updated_ts || '') > (cur.updated_ts || '')) {
      await tx.objectStore('flags').put(f);
      count.flags++;
    }
  }
  const meta = tx.objectStore('meta');
  if (b.meta.userSettings) await meta.put({ key: 'userSettings', value: cleanUserSettings(b.meta.userSettings) });
  if (Array.isArray(b.meta.studyTags)) await meta.put({ key: 'studyTags', value: b.meta.studyTags });
  // The group and help language only when this device has none yet (a new phone); never overwrite a choice here.
  if (typeof b.meta.groupCode === 'string' && /^[a-z2-9]{8}$/.test(b.meta.groupCode) && !(await meta.get('groupCode'))) {
    await meta.put({ key: 'groupCode', value: b.meta.groupCode });
  }
  if (typeof b.meta.helpLang === 'string' && (await meta.get('helpLang')) === undefined) await meta.put({ key: 'helpLang', value: b.meta.helpLang });
  if (b.meta.dayCounts) {
    const cur = ((await meta.get('dayCounts'))?.value ?? {}) as Record<string, number>;
    const merged = { ...cur };
    for (const [day, n] of Object.entries(b.meta.dayCounts)) merged[day] = Math.max(merged[day] ?? 0, Number(n) || 0);
    await meta.put({ key: 'dayCounts', value: merged });
  }
  if (b.meta.curriculumOpened && typeof b.meta.curriculumOpened === 'object') {
    // Opened topics: union, the earliest date wins (a dicht row clears its tag again at the next evaluation).
    const cur = ((await meta.get('curriculumOpened'))?.value ?? {}) as Record<string, string>;
    const merged = { ...cur };
    for (const [tag, day] of Object.entries(b.meta.curriculumOpened)) {
      if (typeof day === 'string' && (!merged[tag] || day < merged[tag])) merged[tag] = day;
    }
    await meta.put({ key: 'curriculumOpened', value: merged });
  }
  // Today's records (new-card intro list, "Vandaag" bar) only matter when the backup is from today.
  const today = localDate(now);
  const intro = b.meta.intro;
  if (intro && intro.date === today) {
    const cur = (await meta.get('intro'))?.value as Meta['intro'] | undefined;
    const same = cur && cur.date === today;
    const union = (x: string[] = [], y: string[] = []) => [...new Set([...x, ...y])];
    await meta.put({ key: 'intro', value: same ? { date: today, main: union(cur!.main, intro.main), prod: union(cur!.prod, intro.prod) } : intro });
  }
  const done = b.meta.doneToday;
  if (done && done.date === today) {
    const cur = (await meta.get('doneToday'))?.value as Meta['doneToday'] | undefined;
    await meta.put({ key: 'doneToday', value: cur && cur.date === today ? { date: today, items: { ...done.items, ...cur.items } } : done });
  }
  await tx.done;
  return count;
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const env = NS.endsWith('-dev') ? '-dev' : '';
  return `speesrep${env}-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
