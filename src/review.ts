import { pendingCount, recordReview, type ReviewEvent } from './db';
import { snapshotOf, type Outcome } from './scheduler';
import { modeFor, type Item } from './session';
import { getState, setState } from './store';
import { leavesWindow, todaysDone, todaysRound } from './today';
import { currentSettings } from './settings';
import { pushQueue } from './sync';

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
 * Stores one rating (progress + outbox event + daily intro + done-today) and schedules a background push.
 * The item counts as done today once its next due time is past the due window.
 */
export async function rate(item: Item, outcome: Outcome, shownAt: number, now = new Date()): Promise<void> {
  const s = getState();
  const intro = { ...s.intro, main: [...s.intro.main], prod: [...s.intro.prod] };
  if (item.isNew) {
    const list = item.track === 'prod' && item.card.type === 'word' ? intro.prod : intro.main;
    if (!list.includes(item.card.id)) list.push(item.card.id);
  }
  const next = { ...outcome.next, last_review: now.toISOString() };
  const event: ReviewEvent = {
    event_id: uuid(),
    card_id: item.card.id,
    track: item.track,
    ts: now.toISOString(),
    rating: outcome.rating as ReviewEvent['rating'],
    mode: modeFor(item.card, item.track, item.listen),
    duration_ms: Math.max(0, Math.round(now.getTime() - shownAt)),
    snapshot: snapshotOf(next)
  };
  let doneToday = todaysDone(s.doneToday, now);
  let round = todaysRound(s.round, now);
  if (leavesWindow(next.due, now, currentSettings())) {
    const introduced = item.track === 'prod' && item.card.type === 'word' ? intro.prod : intro.main;
    const kind = introduced.includes(item.card.id) ? 'new' : 'due';
    doneToday = { ...doneToday, items: { ...doneToday.items, [next.key]: doneToday.items[next.key] ?? kind } };
    round = { ...round, items: { ...round.items, [next.key]: round.items[next.key] ?? kind } };
  }
  await recordReview(next, event, intro, doneToday, round);
  const progress = new Map(s.progress);
  progress.set(next.key, next);
  const dayCounts = { ...s.dayCounts, [intro.date]: (s.dayCounts[intro.date] ?? 0) + 1 };
  setState({ progress, intro, pending: s.pending + 1, dayCounts, doneToday, round });
  schedulePush();
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Pushes a few seconds after the last rating when online. Failures are fine: the queue keeps them. */
export function schedulePush(delay = 4000) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!navigator.onLine || getState().sync === 'syncing') return;
    try {
      await pushQueue();
    } catch {
      /* stays queued; next sync retries */
    }
    setState({ pending: await pendingCount() });
  }, delay);
}
