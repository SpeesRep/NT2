import { describe, expect, it } from 'vitest';
import { interleave, localDate, pickNextIndex, planToday, todaysIntro, type Intro } from './session';
import { progressKey, type Progress } from './scheduler';
import type { Card } from './types';

const now = new Date('2026-09-28T10:00:00');
const settings = { new_per_day: 3, unlock_prod_stability_days: 3, due_window_minutes: 10, max_reviews_per_day: 100 };
const card = (id: string, type: Card['type'] = 'word', added = '2026-09-27'): Card =>
  ({ id, type, nl: id, article: '', pos: '', fr: id, example_nl: '', example_fr: '', tags: [], flags: [], answer: '', added, active: true }) as Card;
const prog = (id: string, track: 'recog' | 'prod', due: string, stability = 1): Progress => ({
  key: progressKey(id, track), card_id: id, track, state: 'Review', due, stability, difficulty: 5, reps: 2, lapses: 0,
  last_review: '2026-09-20T10:00:00.000Z', learning_steps: 0, scheduled_days: 1
});
const empty = (): Intro => todaysIntro(undefined, now);

describe('planToday', () => {
  const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => card(id));

  it('caps new cards per day, in added order', () => {
    const plan = planToday(cards, new Map(), settings, empty(), now);
    expect(plan.due).toEqual([]);
    expect(plan.fresh.map((i) => i.card.id)).toEqual(['a', 'b', 'c']);
    expect(plan.fresh.every((i) => i.track === 'recog' && i.isNew)).toBe(true);
  });

  it('cards already introduced today use up the cap', () => {
    const intro = { ...empty(), main: ['a', 'b'] };
    const progress = new Map([['a', 'b'].map((id) => [progressKey(id, 'recog'), prog(id, 'recog', '2026-09-29T10:00:00Z')] as const)].flat());
    const plan = planToday(cards, progress, settings, intro, now);
    expect(plan.fresh.map((i) => i.card.id)).toEqual(['c']);
  });

  it('yesterday’s intro list does not count today', () => {
    const intro = { date: '2026-09-27', main: ['x', 'y', 'z'], prod: [] };
    expect(todaysIntro(intro, now).main).toEqual([]);
    expect(localDate(now)).toBe('2026-09-28');
  });

  it('due items are the started ones whose time has come, oldest first', () => {
    const progress = new Map([
      [progressKey('a', 'recog'), prog('a', 'recog', '2026-09-28T09:00:00')],
      [progressKey('b', 'recog'), prog('b', 'recog', '2026-09-27T09:00:00')],
      [progressKey('c', 'recog'), prog('c', 'recog', '2026-09-29T09:00:00')]
    ]);
    const plan = planToday(cards, progress, settings, empty(), now);
    expect(plan.due.map((i) => i.card.id)).toEqual(['b', 'a']);
    expect(plan.fresh.map((i) => i.card.id)).toEqual(['d', 'e']);
  });

  it('sentence/question cards start on prod; unlocked word prod is a separate small cap', () => {
    const mixed = [card('w1'), card('s1', 'sentence'), card('q1', 'question')];
    const progress = new Map([[progressKey('w1', 'recog'), prog('w1', 'recog', '2026-10-10T00:00:00', 5)]]);
    const plan = planToday(mixed, progress, settings, empty(), now);
    expect(plan.fresh.map((i) => `${i.card.id}:${i.track}`)).toEqual(['s1:prod', 'q1:prod', 'w1:prod']);
  });

  it('respects a filter (e.g. tags)', () => {
    const plan = planToday(cards, new Map(), settings, empty(), now, { eligible: (c) => c.id !== 'a' });
    expect(plan.fresh.map((i) => i.card.id)).toEqual(['b', 'c', 'd']);
  });

  it('interleaves one new card after every 3 due cards', () => {
    const mk = (id: string, isNew: boolean) => ({ card: card(id), track: 'recog' as const, isNew });
    const order = interleave({ due: ['d1', 'd2', 'd3', 'd4'].map((d) => mk(d, false)), fresh: ['n1', 'n2'].map((n) => mk(n, true)) });
    expect(order.map((i) => i.card.id)).toEqual(['d1', 'd2', 'd3', 'n1', 'd4', 'n2']);
  });
});

describe('new cards wait for the learning backlog (option 1)', () => {
  const mk = (id: string, isNew: boolean, learning = false) => ({ card: card(id), track: 'recog' as const, isNew, learning });

  it('shows the new card while fewer than max cards are in short steps', () => {
    expect(pickNextIndex([mk('n1', true), mk('l1', false, true), mk('l2', false, true)], 3)).toBe(0);
  });

  it('holds the new card back once the backlog is full', () => {
    const q = [mk('n1', true), mk('l1', false, true), mk('l2', false, true), mk('n2', true), mk('l3', false, true)];
    expect(pickNextIndex(q, 3)).toBe(1);
  });

  it('due reviews count as "not new" and may go first too', () => {
    const q = [mk('n1', true), mk('d1', false), mk('l1', false, true), mk('l2', false, true), mk('l3', false, true)];
    expect(pickNextIndex(q, 3)).toBe(1);
  });

  it('when only new cards are left, the first one is shown', () => {
    expect(pickNextIndex([mk('n1', true), mk('n2', true)], 0)).toBe(0);
  });
});

describe('due window and daily cap', () => {
  const at = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();

  it('includes learning cards due within due_window_minutes (10), not later ones', () => {
    const cards = [card('l1'), card('l2'), card('r1')];
    const progress = new Map([
      [progressKey('l1', 'recog'), { ...prog('l1', 'recog', at(8)), state: 'Learning' as const }],
      [progressKey('l2', 'recog'), { ...prog('l2', 'recog', at(12)), state: 'Learning' as const }],
      [progressKey('r1', 'recog'), prog('r1', 'recog', at(-60))]
    ]);
    const plan = planToday(cards, progress, settings, empty(), now);
    expect(plan.due.map((i) => [i.card.id, !!i.learning])).toEqual([['r1', false], ['l1', true]]);
  });

  it('caps the due part at max_reviews_per_day minus today’s due reviews; the overflow stays due for tomorrow', () => {
    const cards = ['a', 'b', 'c', 'd'].map((id) => card(id));
    const progress = new Map(cards.map((c, i) => [progressKey(c.id, 'recog'), prog(c.id, 'recog', at(-100 + i))]));
    const capped = { ...settings, max_reviews_per_day: 3 };
    expect(planToday(cards, progress, capped, empty(), now).due.map((i) => i.card.id)).toEqual(['a', 'b', 'c']);
    expect(planToday(cards, progress, capped, empty(), now, { dueDone: 2 }).due.map((i) => i.card.id)).toEqual(['a']);
    // a, b, c reviewed today (next due in days): tomorrow the cap starts again and 'd' — still due — is there.
    for (const id of ['a', 'b', 'c']) progress.set(progressKey(id, 'recog'), prog(id, 'recog', at(5 * 24 * 60)));
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
    expect(planToday(cards, progress, capped, todaysIntro(undefined, tomorrow), tomorrow).due.map((i) => i.card.id)).toEqual(['d']);
  });

  it('due cards come first; new cards are interleaved and never exceed the quota', () => {
    const cards = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'n1', 'n2', 'n3', 'n4', 'n5'].map((id) => card(id));
    const progress = new Map(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((id, i) => [progressKey(id, 'recog'), prog(id, 'recog', at(-60 + i))]));
    const order = interleave(planToday(cards, progress, settings, empty(), now)).map((i) => i.card.id);
    expect(order).toEqual(['d1', 'd2', 'd3', 'n1', 'd4', 'd5', 'd6', 'n2', 'n3']);
  });
});
