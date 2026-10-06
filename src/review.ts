import { recordReview } from './db';
import type { Outcome } from './scheduler';
import type { Item } from './session';
import { getState, setState } from './store';
import { leavesWindow, todaysDone, todaysRound } from './today';
import { currentSettings } from './settings';

export function uuid(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Stores one rating (progress + daily intro + done-today) on this device. Nothing is sent anywhere.
 * The item counts as done today once its next due time is past the due window.
 */
export async function rate(item: Item, outcome: Outcome, _shownAt: number, now = new Date()): Promise<void> {
  const s = getState();
  const intro = { ...s.intro, main: [...s.intro.main], prod: [...s.intro.prod] };
  if (item.isNew) {
    const list = item.track === 'prod' && item.card.type === 'word' ? intro.prod : intro.main;
    if (!list.includes(item.card.id)) list.push(item.card.id);
  }
  const next = { ...outcome.next, last_review: now.toISOString() };
  let doneToday = todaysDone(s.doneToday, now);
  let round = todaysRound(s.round, now);
  if (leavesWindow(next.due, now, currentSettings())) {
    const introduced = item.track === 'prod' && item.card.type === 'word' ? intro.prod : intro.main;
    const kind = introduced.includes(item.card.id) ? 'new' : 'due';
    doneToday = { ...doneToday, items: { ...doneToday.items, [next.key]: doneToday.items[next.key] ?? kind } };
    round = { ...round, items: { ...round.items, [next.key]: round.items[next.key] ?? kind } };
  }
  await recordReview(next, intro, doneToday, round);
  const progress = new Map(s.progress);
  progress.set(next.key, next);
  const dayCounts = { ...s.dayCounts, [intro.date]: (s.dayCounts[intro.date] ?? 0) + 1 };
  setState({ progress, intro, dayCounts, doneToday, round });
}
