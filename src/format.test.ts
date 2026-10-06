import { describe, expect, it } from 'vitest';
import { formatInterval, timeAgo } from './format';
import { INTERVAL_UNITS, RATINGS, UI } from './i18n';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatInterval (Dutch units)', () => {
  it.each([
    [30_000, '1 min'],
    [10 * MIN, '10 min'],
    [59 * MIN, '59 min'],
    [2 * HOUR, '2 u'],
    [23 * HOUR, '23 u'],
    [DAY, '1 d'],
    [3 * DAY, '3 d'],
    [6 * DAY, '6 d'],
    [7 * DAY, '1 wk'],
    [21 * DAY, '3 wk'],
    [4 * 30.44 * DAY, '4 mnd'],
    [364 * DAY, '12 mnd'],
    [365.25 * DAY, '1 jr'],
    [1.5 * 365.25 * DAY, '1,5 jr'],
    [4 * 365.25 * DAY, '4 jr'],
    [12.3 * 365.25 * DAY, '12 jr']
  ])('%d ms → %s', (ms, expected) => {
    expect(formatInterval(ms)).toBe(expected);
  });

  it('uses only the configured unit strings', () => {
    const units = new Set(Object.values(INTERVAL_UNITS));
    for (const ms of [MIN, HOUR, DAY, 10 * DAY, 100 * DAY, 1000 * DAY]) {
      expect(units.has(formatInterval(ms).split(' ')[1] as never)).toBe(true);
    }
  });
});

describe('timeAgo (Dutch)', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  it.each([
    [10_000, 'zojuist'],
    [MIN, '1 minuut geleden'],
    [5 * MIN, '5 minuten geleden'],
    [HOUR, '1 uur geleden'],
    [3 * HOUR, '3 uur geleden'],
    [DAY, '1 dag geleden'],
    [2 * DAY, '2 dagen geleden'],
    [15 * DAY, '2 weken geleden']
  ])('%d ms ago → %s', (ago, expected) => {
    expect(timeAgo(+now - ago, now)).toBe(expected);
  });
});

describe('i18n', () => {
  it('every UI string has nl and fr', () => {
    for (const [key, v] of Object.entries(UI)) {
      expect(v.nl, key).toBeTruthy();
      expect(v.fr, key).toBeTruthy();
    }
  });

  it('rating buttons are ordered Again→Easy with Dutch labels', () => {
    expect(RATINGS.map((r) => [r.rating, r.emoji, r.nl])).toEqual([
      [1, '❌', 'Opnieuw'],
      [2, '😅', 'Moeilijk'],
      [3, '✅', 'Goed'],
      [4, '😎', 'Makkelijk']
    ]);
  });
});
