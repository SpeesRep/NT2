import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDb, getMeta, recordReview } from './db';
import { dueDoneCount, getNewPerDay, laterToday, leavesWindow, nextRound, roundLater, todayBar, todaysDone, todaysRound, type DoneToday } from './today';
import { planToday, todaysIntro } from './session';
import { progressKey, type Progress } from './scheduler';
import type { Card } from './types';

const now = new Date('2026-10-04T10:00:00');
const at = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();
const settings = { new_per_day: 2, unlock_prod_stability_days: 3, due_window_minutes: 10, max_reviews_per_day: 100 };
const card = (id: string): Card =>
  ({ id, type: 'word', nl: id, article: '', pos: '', fr: id, example_nl: '', example_fr: '', tags: [], flags: [], answer: '', added: '2026-10-01', active: true }) as Card;
const prog = (id: string, due: string, state: Progress['state'] = 'Review'): Progress => ({
  key: progressKey(id, 'recog'), card_id: id, track: 'recog', state, due, stability: 1, difficulty: 5, reps: 2, lapses: 0,
  last_review: at(-1440), learning_steps: 0, scheduled_days: 1
});

describe('daily quota', () => {
  it('getNewPerDay is the one source of the daily new-card limit', () => {
    expect(getNewPerDay({ new_per_day: 10 })).toBe(10);
  });
});

describe('the "Vandaag" bar', () => {
  it('counts unique items and never exceeds 100 %', () => {
    const done: DoneToday = { date: '2026-10-04', items: { 'a|recog': 'due', 'b|recog': 'new', 'c|recog': 'due' } };
    // c is due again (a longer learning step): it counts once, as remaining.
    const bar = todayBar(done, ['c|recog', 'd|recog', 'd|recog']);
    expect(bar).toEqual({ done: 2, remaining: 2, fill: 0.5 });
    expect(todayBar(done, []).fill).toBe(1);
    expect(todayBar(todaysDone(undefined, now), []).fill).toBe(0);
  });

  it('an item is done once it leaves the due window', () => {
    expect(leavesWindow(at(8), now, settings)).toBe(false);
    expect(leavesWindow(at(11), now, settings)).toBe(true);
  });

  it('resets at local midnight', () => {
    const done: DoneToday = { date: '2026-10-04', items: { 'a|recog': 'due' } };
    expect(todaysDone(done, now).items).toEqual({ 'a|recog': 'due' });
    expect(todaysDone(done, new Date('2026-10-05T00:01:00')).items).toEqual({});
    expect(dueDoneCount(done)).toBe(1);
  });
});

describe('resume after stopping (done_today is stored with the rating)', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
    _resetDb();
  });

  it('reopening the app the same day gives the same bar', async () => {
    const done: DoneToday = { date: '2026-10-04', items: { 'a|recog': 'due' } };
    const p = prog('a', at(3 * 1440));
    await recordReview(p, { event_id: 'e1', card_id: 'a', track: 'recog', ts: now.toISOString(), rating: 3, mode: 'nl_fr', duration_ms: 1, snapshot: {} as never },
      todaysIntro(undefined, now), done);
    _resetDb(); // app closed and reopened
    const stored = await getMeta('doneToday');
    expect(todayBar(todaysDone(stored, now), ['b|recog'])).toEqual({ done: 1, remaining: 1, fill: 0.5 });
  });
});

describe('"Klaar voor nu!" and the next card later today', () => {
  it('only when nothing is due and the new quota is used up', () => {
    const cards = [card('a'), card('n1'), card('n2')];
    const progress = new Map([[progressKey('a', 'recog'), prog('a', at(-5))]]);
    const work = (intro = todaysIntro(undefined, now)) => {
      const p = planToday(cards, progress, settings, intro, now);
      return p.due.length + p.fresh.length;
    };
    expect(work()).toBe(3); // due + quota left → Starten
    const quotaUsed = { ...todaysIntro(undefined, now), main: ['x', 'y'] };
    expect(work(quotaUsed)).toBe(1); // still a due card → not done
    progress.set(progressKey('a', 'recog'), prog('a', at(3 * 1440)));
    expect(work(quotaUsed)).toBe(0); // nothing due, quota used → "Klaar voor nu!"
  });
});

describe('strict due window (due_window_minutes = 10)', () => {
  it('9 minutes away is part of the round, exactly 10 minutes is not', () => {
    const cards = [card('a9'), card('a10')];
    const progress = new Map([
      [progressKey('a9', 'recog'), prog('a9', at(9))],
      [progressKey('a10', 'recog'), prog('a10', at(10))]
    ]);
    expect(planToday(cards, progress, settings, todaysIntro(undefined, now), now).due.map((i) => i.card.id)).toEqual(['a9']);
    expect(leavesWindow(at(9), now, settings)).toBe(false);
    expect(leavesWindow(at(10), now, settings)).toBe(true);
  });
});

describe('the bar covers the current round only', () => {
  it('a finished round + new cards → a new round that counts from 0', () => {
    let r = todaysRound(undefined, now);
    r = { ...r, items: { 'a|recog': 'due', 'b|recog': 'due' } };
    expect(todayBar(r, ['c|recog']).fill).toBeCloseTo(2 / 3);
    const finished = nextRound(r, 0);
    expect(finished.finished).toBe(true);
    expect(todayBar(finished, []).fill).toBe(1);
    const fresh = nextRound(finished, 2); // later cards arrived
    expect(fresh.items).toEqual({});
    expect(todayBar(fresh, ['x|recog', 'y|recog'])).toEqual({ done: 0, remaining: 2, fill: 0 });
  });

  it('a card arriving while the round is going joins it: the count is kept, the total grows', () => {
    const r = { ...todaysRound(undefined, now), items: { 'a|recog': 'due' as const } };
    expect(nextRound(r, 2)).toBe(r); // unchanged, not a new round
    expect(todayBar(r, ['b|recog'])).toEqual({ done: 1, remaining: 1, fill: 0.5 });
    expect(todayBar(r, ['b|recog', 'late|recog'])).toEqual({ done: 1, remaining: 2, fill: 1 / 3 });
  });

  it('a new day starts a new round', () => {
    const r = { date: '2026-10-04', items: { 'a|recog': 'due' as const }, finished: false };
    expect(todaysRound(r, new Date('2026-10-05T08:00:00')).items).toEqual({});
  });
});

describe('later today ("Volgende kaarten: …")', () => {
  it('rounds to 5 min below an hour, whole hours from 60 min', () => {
    expect(roundLater(12)).toEqual({ min: 10 });
    expect(roundLater(23)).toEqual({ min: 25 });
    expect(roundLater(59)).toEqual({ hour: 1 });
    expect(roundLater(61)).toEqual({ hour: 1 });
    expect(roundLater(130)).toEqual({ hour: 2 });
  });

  it('names only when the 5th later card is due; fewer than 5 → no line; tomorrow never counts', () => {
    const ids = ['m11', 'm12', 'm23', 'm59', 'm61', 'm130', 'tomorrow'];
    const mins = [11, 12, 23, 59, 61, 130, 20 * 60];
    const progress = new Map(ids.map((id, i) => [progressKey(id, 'recog'), prog(id, at(mins[i]))]));
    const r = laterToday(ids.map(card), progress, settings, now);
    expect(r.groups).toEqual([{ n: 5, hour: 1 }]); // the 5th (61 min) → "5 over ± 1 uur"
    expect(r.nextAt).toBe(now.getTime() + 60_000); // the first (11 min) joins the round in 1 min (window 10)
    const four = ids.slice(0, 4);
    expect(laterToday(four.map(card), progress, settings, now).groups).toEqual([]); // only 4 later today
    const tomorrowOnly = new Map([[progressKey('t', 'recog'), prog('t', at(20 * 60))]]);
    expect(laterToday([card('t')], tomorrowOnly, settings, now).groups).toEqual([]);
  });

  it('the line is there while Starten is too, and a card rejoins the round when its time comes', () => {
    const later5 = ['s1', 's2', 's3', 's4', 's5'];
    const cards = [card('now1'), ...later5.map(card)];
    const progress = new Map([
      [progressKey('now1', 'recog'), prog('now1', at(-5))],
      ...later5.map((id, i) => [progressKey(id, 'recog'), prog(id, at(15 + i * 5), 'Learning')] as [string, Progress])
    ]);
    const plan = planToday(cards, progress, settings, { ...todaysIntro(undefined, now), main: ['x', 'y'] }, now);
    expect(plan.due.map((i) => i.card.id)).toEqual(['now1']); // Starten
    expect(laterToday(cards, progress, settings, now).groups).toEqual([{ n: 5, min: 35 }]); // + the line
    const later = new Date(now.getTime() + 6 * 60_000); // s1 is now 9 min away → in the round
    expect(planToday(cards, progress, settings, { ...todaysIntro(undefined, later), main: ['x', 'y'] }, later).due.map((i) => i.card.id)).toEqual(['now1', 's1']);
    expect(laterToday(cards, progress, settings, later).groups).toEqual([]); // 4 left later → no line
  });
});
