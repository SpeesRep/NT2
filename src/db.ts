import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { NS } from './config';
import { cardLabel } from './display';
import { DEFAULT_SETTINGS, type Card, type CurriculumRow, type GroupInfo, type Settings, type Tag } from './types';

/** 'ok' = the group's list is published; 'stopped' = the group was deactivated; 'unknown' = no such code (any more). */
export type GroupStatus = 'ok' | 'stopped' | 'unknown';
import type { Progress, Snapshot, Track } from './scheduler';
import type { Intro, Mode } from './session';
import type { DoneToday, Round } from './today';
import type { UserSettings } from './userSettings';

/** One review event. SpeesRep no longer stores or sends these (no data collection); kept for old backups. */
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
//   queue    — unused since SpeesRep (reviews never leave the device); kept so the schema needs no upgrade

export type Meta = {
  settings: Settings;
  tags: Tag[];
  lastSync: string; // ISO time of the last successful content check
  contentVersion: string; // `version` of the stored content.json
  groupCode: string; // the student's group (the ONLY thing that identifies the group; never sent anywhere)
  group: GroupInfo; // its display name and help languages (from content.json)
  groupStatus: GroupStatus; // 'stopped' / 'unknown' after a check; the cards stay
  helpLang: string; // chosen help language ('' = none); missing = not chosen yet
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
 * Saves one review: new progress + today's intro list + the day count (+ the item as done today when it left
 * the due window), in ONE transaction. Either all are stored or none. Nothing is queued for sending.
 */
export async function recordReview(progress: Progress, intro: Intro, doneToday?: DoneToday, round?: Round): Promise<void> {
  const d = await db();
  const tx = d.transaction(['progress', 'meta'], 'readwrite');
  await tx.objectStore('progress').put(progress);
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
