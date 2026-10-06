import { describe, expect, it } from 'vitest';
import { afterRating } from './sessionFlow';
import { planToday, todaysIntro, type Item } from './session';
import { laterToday, leavesWindow } from './today';
import { progressKey, type Progress } from './scheduler';
import type { Card } from './types';

const T0 = Date.parse('2026-10-04T10:00:00');
const MIN = 60_000;
const rules = { max_learning_backlog: 3, due_window_minutes: 10 };
const settings = { ...rules, new_per_day: 0, unlock_prod_stability_days: 3, max_reviews_per_day: 100 };
const card = (id: string): Card =>
  ({ id, type: 'word', nl: id, article: '', pos: '', fr: id, example_nl: '', example_fr: '', tags: [], flags: [], answer: '', added: '2026-10-01', active: true }) as Card;
const newItem = (id: string): Item => ({ card: card(id), track: 'recog', isNew: true });
const prog = (id: string, dueAt: number): Progress => ({
  key: progressKey(id, 'recog'), card_id: id, track: 'recog', state: 'Learning', due: new Date(dueAt).toISOString(), stability: 1,
  difficulty: 5, reps: 1, lapses: 0, last_review: new Date(T0).toISOString(), learning_steps: 1, scheduled_days: 0
});
/** Rates the front card at `now` with its next step `stepMin` minutes away. */
const rate = (queue: Item[], stepMin: number, now = T0) => afterRating(queue, prog(queue[0].card.id, now + stepMin * MIN), rules, now);
const ids = (q: Item[]) => q.map((i) => i.card.id);

describe('requeue = the due window (one rule, strictly less than due_window_minutes)', () => {
  it('a 9-minute step comes back in this run, a 10-minute step ("Goed") leaves it', () => {
    const q = ['c1', 'c2', 'c3', 'c4', 'c5'].map(newItem);
    expect(ids(rate(q, 9))).toContain('c1');
    expect(ids(rate(q, 10))).not.toContain('c1');
    expect(ids(rate(q, 4 * 24 * 60))).not.toContain('c1'); // Makkelijk
  });

  it('"Goed": the bar counts it as done, home lists it as later, and it rejoins the round when its time comes', () => {
    const due = T0 + 10 * MIN;
    const p = { ...prog('g', due), state: 'Learning' as const };
    expect(leavesWindow(p.due, new Date(T0), rules)).toBe(true); // done for the bar
    const progress = new Map([[p.key, p]]);
    const at = (t: number) => planToday([card('g')], progress, settings, todaysIntro(undefined, new Date(t)), new Date(t));
    expect(at(T0).due).toEqual([]);
    const later = laterToday([card('g')], progress, settings, new Date(T0));
    expect(later.groups).toEqual([]); // one card: no line (only from 5 cards)
    expect(later.nextAt).toBe(due - 10 * MIN); // but home wakes up when it joins the round
    expect(ids(at(T0 + 2 * MIN).due)).toEqual(['g']); // now 8 min away → back in the round
  });
});

describe('next card', () => {
  it('a requeued card is not shown before its due time while other cards are ready', () => {
    let q = ['c1', 'c2'].map(newItem);
    q = rate(q, 1); // c1 Again: due in 1 min, put after c2
    expect(ids(q)).toEqual(['c2', 'c1']);
    // c2 → Makkelijk at T0 + 10 s: only c1 is left, not due yet → shown anyway (the run never stalls).
    q = afterRating(q, prog('c2', T0 + 4 * 24 * 60 * MIN), rules, T0 + 10_000);
    expect(ids(q)).toEqual(['c1']);
  });

  it('skips a waiting card for a ready one even when it is first in line', () => {
    const waitingCard: Item = { card: card('w'), track: 'recog', isNew: false, learning: true, progress: prog('w', T0 + 5 * MIN) };
    const q = afterRating([newItem('x'), waitingCard, newItem('n1')], prog('x', T0 + 4 * 24 * 60 * MIN), rules, T0);
    expect(ids(q)).toEqual(['n1', 'w']);
  });

  it('new cards wait while max_learning_backlog cards are in short steps (when one of them is ready)', () => {
    let q = Array.from({ length: 6 }, (_, i) => newItem(`c${i + 1}`));
    q = rate(q, 1);
    q = rate(q, 1);
    q = rate(q, 1); // 3 cards in short steps
    const later = T0 + 2 * MIN; // they are due now
    q = afterRating(q, prog(q[0].card.id, later + 4 * 24 * 60 * MIN), rules, later);
    expect(q[0].learning).toBe(true);
  });

  it('runs until the queue is empty: there is no card or minute cap', () => {
    let q = Array.from({ length: 40 }, (_, i) => newItem(`c${i + 1}`));
    let n = 0;
    while (q.length && n < 100) {
      q = rate(q, 4 * 24 * 60);
      n++;
    }
    expect(n).toBe(40);
  });
});
