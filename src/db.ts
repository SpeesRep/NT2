import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { NS } from './config';
import { cardLabel } from './display';
import { DEFAULT_SETTINGS, type Card, type CurriculumRow, type Settings, type Tag } from './types';
import type { Progress, Snapshot, Track } from './scheduler';
import type { Intro, Mode } from './session';
import type { DoneToday, Round } from './today';
import type { UserSettings } from './userSettings';

/** One review, as stored in the outbox and sent to the API (Log row). */
export type ReviewEvent = {
  event_id: string;
  card_id: string;
  track: Track;
  ts: string; // ISO
  rating: 1 | 2 | 3 | 4;
  mode: Mode;
  duration_ms: number;
  snapshot: Snapshot;
};

// One IndexedDB per environment (DEV and PROD share the github.io origin).
// Stores:
//   cards    — every active card from the sheet (replaced on each pull)
//   meta     — settings, tags, lastSync, doneToday …
//   progress — FSRS state per card+track (stage 3)
//   queue    — review events waiting to be pushed (stage 3/4)

export type Meta = {
  settings: Settings;
  tags: Tag[];
  lastSync: string; // ISO time of the last successful sync
  intro: Intro; // new cards introduced today
  curriculum: CurriculumRow[];
  curriculumOpened: Record<string, string>; // latch: tag → local date it opened (src/curriculum.ts)
  studyTags: string[]; // tag filter ("Kies een onderwerp"); [] = everything
  doneToday: DoneToday; // items finished today (silent daily due cap); another date counts as empty
  round: Round; // the current round (the "Vandaag" bar); see src/today.ts
  userSettings: UserSettings; // her own Instellingen — phone only, never sent to the Sheet
  dayCounts: Record<string, number>; // local date (yyyy-mm-dd) → reviews that day (Voortgang screen)
};

/**
 * A card the LEARNER marked with 🚩 (local only, never synced; she shares them herself).
 * Not the same thing as Card.flags (false-friend/separable content markers set in the sheet).
 * Field names are stable so a future synced version could push these records as they are.
 */
export type StudentFlag = {
  id: string; // uuid
  card_id: string;
  ts: string; // ISO — when she flagged it
  note: string; // optional, '' when none
  resolved: boolean;
  updated_ts: string; // ISO — last change (note / resolved); lets a future sync merge by recency
  label?: string; // card name when flagged ("het huis (la maison)"), shown if the card later leaves the phone
};

interface SpeesRepDB extends DBSchema {
  cards: { key: string; value: Card; indexes: { added: string } };
  meta: { key: string; value: { key: keyof Meta; value: unknown } };
  progress: { key: string; value: Progress; indexes: { card_id: string } };
  queue: { key: string; value: ReviewEvent; indexes: { ts: string } };
  flags: { key: string; value: StudentFlag; indexes: { card_id: string; ts: string } };
}

let dbPromise: Promise<IDBPDatabase<SpeesRepDB>> | null = null;
let onDbBlocked: (() => void) | null = null;
/** Called when an upgrade waits for another open copy of the app (the UI shows a message). */
export function setDbBlockedHandler(fn: () => void) {
  onDbBlocked = fn;
}

export function db(name = NS): Promise<IDBPDatabase<SpeesRepDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SpeesRepDB>(name, 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('cards', { keyPath: 'id' }).createIndex('added', 'added');
          d.createObjectStore('meta', { keyPath: 'key' });
          d.createObjectStore('progress', { keyPath: 'key' }).createIndex('card_id', 'card_id');
          d.createObjectStore('queue', { keyPath: 'event_id' }).createIndex('ts', 'ts');
        }
        if (oldVersion < 2) {
          const flags = d.createObjectStore('flags', { keyPath: 'id' });
          flags.createIndex('card_id', 'card_id');
          flags.createIndex('ts', 'ts');
        }
      },
      // Another (older) copy of the app still has the database open, so this upgrade has to wait.
      blocked() {
        onDbBlocked?.();
      },
      // A NEWER version of the app wants to upgrade: let go and reload into it (never block an upgrade).
      blocking() {
        void dbPromise?.then((d) => d.close());
        dbPromise = null;
        if (typeof location !== 'undefined') location.reload();
      },
      terminated() {
        dbPromise = null;
      }
    });
  }
  return dbPromise;
}

/** Test helper: forget the cached connection. */
export function _resetDb() {
  dbPromise = null;
}

export async function getMeta<K extends keyof Meta>(key: K): Promise<Meta[K] | undefined> {
  const row = await (await db()).get('meta', key);
  return row?.value as Meta[K] | undefined;
}

export async function setMeta<K extends keyof Meta>(key: K, value: Meta[K]): Promise<void> {
  await (await db()).put('meta', { key, value });
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await getMeta('settings')) ?? {}) };
}

export async function allCards(): Promise<Card[]> {
  return (await db()).getAllFromIndex('cards', 'added');
}

/**
 * Replaces the card set and meta in ONE transaction, so a failed pull never leaves half the cards.
 * First, 🚩 flags without a saved name get one from the old cards (a card may leave, e.g. not approved).
 */
export async function saveSnapshot(cards: Card[], meta: Partial<Meta>): Promise<void> {
  const d = await db();
  const tx = d.transaction(['cards', 'meta', 'flags'], 'readwrite');
  const cardStore = tx.objectStore('cards');
  const flagStore = tx.objectStore('flags');
  for (const f of await flagStore.getAll()) {
    if (f.label) continue;
    const old = await cardStore.get(f.card_id);
    if (old) await flagStore.put({ ...f, label: cardLabel(old) });
  }
  await cardStore.clear();
  for (const c of cards) await cardStore.put(c);
  const metaStore = tx.objectStore('meta');
  for (const [key, value] of Object.entries(meta)) await metaStore.put({ key: key as keyof Meta, value });
  await tx.done;
}

export async function allProgress(): Promise<Map<string, Progress>> {
  const rows = await (await db()).getAll('progress');
  return new Map(rows.map((p) => [p.key, p]));
}

/**
 * Saves one review: new progress + outbox event + today's intro list (+ the item as done today when it left
 * the due window), in ONE transaction. Either all are stored or none, so a crash can never lose a review or
 * double-count it.
 */
export async function recordReview(progress: Progress, event: ReviewEvent, intro: Intro, doneToday?: DoneToday, round?: Round): Promise<void> {
  const d = await db();
  const tx = d.transaction(['progress', 'queue', 'meta'], 'readwrite');
  await tx.objectStore('progress').put(progress);
  await tx.objectStore('queue').put(event);
  await tx.objectStore('meta').put({ key: 'intro', value: intro });
  // Reviews per local day (for "Voortgang"), in the same transaction.
  const day = intro.date;
  const row = await tx.objectStore('meta').get('dayCounts');
  const counts = { ...((row?.value as Record<string, number>) ?? {}) };
  counts[day] = (counts[day] ?? 0) + 1;
  await tx.objectStore('meta').put({ key: 'dayCounts', value: counts });
  if (doneToday) await tx.objectStore('meta').put({ key: 'doneToday', value: doneToday });
  if (round) await tx.objectStore('meta').put({ key: 'round', value: round });
  await tx.done;
}

export async function pendingEvents(): Promise<ReviewEvent[]> {
  return (await db()).getAllFromIndex('queue', 'ts');
}

export async function pendingCount(): Promise<number> {
  return (await db()).count('queue');
}

/** Removes events the server confirmed (accepted or already had). */
export async function deleteEvents(ids: string[]): Promise<void> {
  const tx = (await db()).transaction('queue', 'readwrite');
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}

/**
 * Merges Progress from the server. The server row wins only if it is newer than ours AND we have no
 * unsent review for that card+track (our own pending review is always the latest truth).
 */
export async function mergeServerProgress(rows: Progress[]): Promise<number> {
  const d = await db();
  const tx = d.transaction(['progress', 'queue'], 'readwrite');
  const pending = new Set((await tx.objectStore('queue').getAll()).map((e) => `${e.card_id}|${e.track}`));
  let changed = 0;
  for (const row of rows) {
    if (pending.has(row.key)) continue;
    const local = await tx.objectStore('progress').get(row.key);
    if (!local || (row.last_review || '') > (local.last_review || '')) {
      await tx.objectStore('progress').put(row);
      changed++;
    }
  }
  await tx.done;
  return changed;
}
