import { describe, expect, it } from 'vitest';
import { makeScheduler, previewOutcomes, progressKey, snapshotOf, toFsrsCard, fromFsrsCard, tracksFor, type Progress } from './scheduler';
import { formatInterval } from './format';
import type { Card } from './types';

const DAY = 86_400_000;
const sched = makeScheduler({ desired_retention: 0.9 });
const now = new Date('2026-09-28T10:00:00Z');
const word = { id: 'c_1', type: 'word' } as Card;

/** Reviews a card n times with the same rating, each time when due. */
function drill(rating: 1 | 2 | 3 | 4, times: number, start = now): { p: Progress; at: Date } {
  let p: Progress | undefined;
  let at = start;
  for (let i = 0; i < times; i++) {
    const o = previewOutcomes(sched, 'c_1', 'recog', p, at)[rating];
    p = { ...o.next, last_review: at.toISOString() };
    at = new Date(p.due);
  }
  return { p: p!, at };
}

describe('FSRS outcomes', () => {
  it('a new card: Again < Hard < Good < Easy, Again comes back within minutes', () => {
    const o = previewOutcomes(sched, 'c_1', 'recog', undefined, now);
    expect(o[1].intervalMs).toBeLessThan(o[2].intervalMs);
    expect(o[2].intervalMs).toBeLessThanOrEqual(o[3].intervalMs);
    expect(o[3].intervalMs).toBeLessThan(o[4].intervalMs);
    expect(o[1].intervalMs).toBeLessThanOrEqual(10 * 60_000);
    expect(formatInterval(o[1].intervalMs)).toMatch(/min$/);
  });

  it('button intervals are exactly what gets applied (same computation)', () => {
    const o = previewOutcomes(sched, 'c_1', 'recog', undefined, now);
    for (const g of [1, 2, 3, 4] as const) {
      expect(new Date(o[g].next.due).getTime() - now.getTime()).toBe(o[g].intervalMs);
    }
  });

  it('well-known cards drift out to long intervals', () => {
    const { p } = drill(3, 8);
    expect(p.state).toBe('Review');
    expect(p.stability).toBeGreaterThan(60);
    const next = previewOutcomes(sched, 'c_1', 'recog', p, new Date(p.due))[3];
    expect(next.intervalMs).toBeGreaterThan(60 * DAY);
  });

  it('Again on a mature card is a lapse and shortens the interval', () => {
    const { p, at } = drill(3, 6);
    const lapse = previewOutcomes(sched, 'c_1', 'recog', p, at)[1];
    expect(lapse.next.lapses).toBe(p.lapses + 1);
    expect(lapse.next.state).toBe('Relearning');
    expect(lapse.intervalMs).toBeLessThan(DAY);
  });

  it('higher desired retention gives shorter intervals', () => {
    const { p, at } = drill(3, 5);
    const strict = previewOutcomes(makeScheduler({ desired_retention: 0.97 }), 'c_1', 'recog', p, at)[3];
    const loose = previewOutcomes(makeScheduler({ desired_retention: 0.8 }), 'c_1', 'recog', p, at)[3];
    expect(strict.intervalMs).toBeLessThan(loose.intervalMs);
  });

  it('progress survives a round trip through the stored/snapshot form', () => {
    const { p } = drill(3, 3);
    const back = fromFsrsCard('c_1', 'recog', toFsrsCard(p, now));
    expect(back).toMatchObject(snapshotOf(p));
    expect(back.key).toBe(progressKey('c_1', 'recog'));
  });
});

describe('tracks', () => {
  const settings = { unlock_prod_stability_days: 3 };
  it('sentence and question cards only have prod', () => {
    expect(tracksFor({ ...word, type: 'sentence' }, undefined, settings)).toEqual(['prod']);
    expect(tracksFor({ ...word, type: 'question' }, undefined, settings)).toEqual(['prod']);
  });
  it('a word unlocks prod once recog stability reaches the threshold', () => {
    expect(tracksFor(word, undefined, settings)).toEqual(['recog']);
    const weak = drill(3, 1).p;
    expect(weak.stability).toBeLessThan(3);
    expect(tracksFor(word, weak, settings)).toEqual(['recog']);
    const strong = drill(3, 4).p;
    expect(strong.stability).toBeGreaterThanOrEqual(3);
    expect(tracksFor(word, strong, settings)).toEqual(['recog', 'prod']);
  });
});
