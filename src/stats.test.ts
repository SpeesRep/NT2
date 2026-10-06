import { describe, expect, it } from 'vitest';
import { overview } from './stats';
import { progressKey, type Progress } from './scheduler';
import type { Card } from './types';

const now = new Date('2026-10-02T12:00:00');
const card = (id: string): Card => ({ id, type: 'word', tags: [] }) as unknown as Card;
const p = (id: string, due: string, stability: number, reps = 2, state: Progress['state'] = 'Review'): [string, Progress] => [
  progressKey(id, 'recog'),
  { key: progressKey(id, 'recog'), card_id: id, track: 'recog', state, due, stability, difficulty: 5, reps, lapses: 0, last_review: '', learning_steps: 0, scheduled_days: 1 }
];

const K = { known_stability_days: 21, known_min_reviews: 0 };

describe('Voortgang numbers', () => {
  const cards = ['a', 'b', 'c', 'd'].map(card);
  const progress = new Map([
    p('a', '2026-10-02T08:00:00', 30), // due today, known
    p('b', '2026-10-03T08:00:00', 2), // due tomorrow
    p('c', '2026-10-07T08:00:00', 5), // due within 7 days
    p('d', '2026-10-01T00:00:00', 0, 0, 'New') // not started (e.g. reset/never)
  ]);
  const days = { '2026-09-29': 4, '2026-09-30': 6, '2026-10-01': 3, '2026-10-02': 5, '2026-09-20': 9 };

  it('learned, known and total', () => {
    expect(overview(cards, progress, days, K, now)).toMatchObject({ learned: 3, known: 1, total: 4 });
  });

  it('reviews this week, last 7 days and the streak', () => {
    const o = overview(cards, progress, days, K, now);
    expect(o.week).toBe(18);
    expect(o.last7.map((d) => d.n)).toEqual([0, 0, 0, 4, 6, 3, 5]);
    expect(o.streak).toBe(4);
  });

  it('a streak still counts in the morning before today’s first review', () => {
    expect(overview(cards, progress, { '2026-09-30': 1, '2026-10-01': 1 }, K, now).streak).toBe(2);
    expect(overview(cards, progress, { '2026-09-29': 1 }, K, now).streak).toBe(0);
  });

  it('upcoming reviews: today, tomorrow, next 7 days', () => {
    expect(overview(cards, progress, days, K, now)).toMatchObject({ dueToday: 1, dueTomorrow: 1, due7: 3 });
  });
});
