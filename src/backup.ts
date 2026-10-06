import { NS } from './config';
import { db, type Meta, type ReviewEvent, type StudentFlag } from './db';
import type { Progress } from './scheduler';
import { cleanUserSettings } from './userSettings';
import { localDate } from './session';

// Her own JSON backup ("Instellingen" › Back-up): everything that exists only on this phone. Cards are not in it
// (they come from the Sheet). It stays on her device unless she shares the file herself.

export type Backup = {
  app: 'speesrep';
  version: 1;
  ns: string; // speesrep-dev / speesrep-prod: a backup only goes back into the same app
  exported_at: string;
  progress: Progress[];
  queue: ReviewEvent[]; // reviews not yet sent to the server
  flags: StudentFlag[];
  meta: Partial<Pick<Meta, 'intro' | 'doneToday' | 'dayCounts' | 'studyTags' | 'userSettings' | 'curriculumOpened'>>;
};

const META_KEYS = ['intro', 'doneToday', 'dayCounts', 'studyTags', 'userSettings', 'curriculumOpened'] as const;

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
    queue: await d.getAll('queue'),
    flags: await d.getAll('flags'),
    meta
  };
}

export class BackupError extends Error {}

/** Checks a parsed file; throws BackupError('bad' | 'otherApp') when it can't go back into this app. */
export function checkBackup(raw: unknown): Backup {
  const b = raw as Partial<Backup> | null;
  if (!b || b.app !== 'speesrep' || b.version !== 1 || !Array.isArray(b.progress) || !Array.isArray(b.queue) || !Array.isArray(b.flags)) {
    throw new BackupError('bad');
  }
  if (b.ns !== NS) throw new BackupError('otherApp');
  return { ...b, meta: b.meta ?? {} } as Backup;
}

/**
 * Puts a backup back, MERGING with what is on the phone (nothing newer is lost): progress and 🚩 flags keep the
 * newer record, unsent reviews are added (the server de-duplicates on event_id), reviews per day keep the higher
 * count, her settings and topic choice are restored, today's records only when the backup is from today.
 */
export async function importBackup(raw: unknown, now = new Date()): Promise<{ progress: number; queue: number; flags: number }> {
  const b = checkBackup(raw);
  const d = await db();
  const tx = d.transaction(['progress', 'queue', 'flags', 'meta'], 'readwrite');
  const count = { progress: 0, queue: 0, flags: 0 };
  for (const p of b.progress) {
    if (!p || !p.key) continue;
    const cur = await tx.objectStore('progress').get(p.key);
    if (!cur || (p.last_review || '') > (cur.last_review || '')) {
      await tx.objectStore('progress').put(p);
      count.progress++;
    }
  }
  for (const e of b.queue) {
    if (!e || !e.event_id || (await tx.objectStore('queue').get(e.event_id))) continue;
    await tx.objectStore('queue').put(e);
    count.queue++;
  }
  for (const f of b.flags) {
    if (!f || !f.id) continue;
    const cur = await tx.objectStore('flags').get(f.id);
    if (!cur || (f.updated_ts || '') > (cur.updated_ts || '')) {
      await tx.objectStore('flags').put(f);
      count.flags++;
    }
  }
  const meta = tx.objectStore('meta');
  if (b.meta.userSettings) await meta.put({ key: 'userSettings', value: cleanUserSettings(b.meta.userSettings) });
  if (Array.isArray(b.meta.studyTags)) await meta.put({ key: 'studyTags', value: b.meta.studyTags });
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
