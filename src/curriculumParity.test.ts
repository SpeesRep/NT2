import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { curriculumStatus, validateCurriculum } from './curriculum';
import { progressKey, type Progress } from './scheduler';
import type { Card, CurriculumRow } from './types';

// The Apps Script side (apps-script/Curriculum.gs: Dashboard, teacher editor) must validate and evaluate exactly
// like the app (src/curriculum.ts). Load the real Apps Script code and compare on many random situations.

const gs = ['Util.gs', 'Curriculum.gs'].map((f) => readFileSync(join(__dirname, '..', 'apps-script', f), 'utf8')).join('\n');
type Result = ReturnType<typeof curriculumStatus>;
// eslint-disable-next-line no-new-func
const server = new Function(`${gs}; return { curriculumStatus_, validateCurriculum_, migrateCurriculumRows_, ruleCode_ };`)() as {
  curriculumStatus_: (rows: unknown[], cards: unknown[], byKey: Record<string, unknown>, known: unknown, today: string, opened: Record<string, string>, tagKeys: string[]) => Result;
  validateCurriculum_: (rows: unknown[], tagKeys: string[], counts?: Record<string, number>) => ReturnType<typeof validateCurriculum>;
  migrateCurriculumRows_: (old: unknown[]) => { rows: CurriculumRow[]; reliedOnWait: string[]; closed: string[]; inactive: string[]; belowClosed: string[] };
  ruleCode_: (v: unknown) => string;
};

const known = { known_stability_days: 7, known_min_reviews: 2 };
const TAGS = ['a', 'b', 'c', 'd', 'e'];

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

function scenario(seed: number) {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const rows: CurriculumRow[] = TAGS.map((tag, i) => ({
    order: r() < 0.08 ? 2 : i + 1, // sometimes a duplicate order
    tag: r() < 0.05 ? 'zzz' : tag,
    rule: pick(['always', 'date', 'known', 'known', 'closed', 'soms']),
    date: pick(['2026-10-01', '2026-10-20', '2026-10-21', '2026-02-30', '']),
    percentage: pick([null, 0, 50, 80, 100, 120]),
    from_tags: TAGS.filter(() => r() < 0.3).concat(r() < 0.1 ? ['nieuw'] : [])
  }));
  const cards: Card[] = [];
  const progress = new Map<string, Progress>();
  for (let i = 0; i < 25; i++) {
    const id = `c${i}`;
    const type = r() < 0.6 ? 'word' : 'oneway';
    cards.push({ id, type, tags: TAGS.filter(() => r() < 0.35) } as Card);
    if (r() < 0.7) {
      const track = type === 'word' ? 'recog' : 'prod';
      progress.set(progressKey(id, track), {
        key: progressKey(id, track), card_id: id, track, state: 'Review', due: '2026-10-25T00:00:00Z',
        stability: Math.floor(r() * 15), difficulty: 5, reps: Math.floor(r() * 4), lapses: 0, last_review: '2026-10-19T00:00:00Z',
        learning_steps: 0, scheduled_days: 1
      });
    }
  }
  const opened: Record<string, string> = {};
  TAGS.forEach((t) => { if (r() < 0.25) opened[t] = '2026-10-01'; });
  return { rows, cards, progress, opened };
}

describe('Apps Script (Curriculum.gs) = app (curriculum.ts)', () => {
  it('same validation, status, open list and latch on 400 random situations', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { rows, cards, progress, opened } = scenario(seed);
      const app = curriculumStatus(rows, cards, progress, known, '2026-10-20', opened, TAGS);
      const byKey: Record<string, unknown> = {};
      progress.forEach((p, k) => (byKey[k] = p));
      const srv = server.curriculumStatus_(rows, cards, byKey, known, '2026-10-20', opened, TAGS);
      expect(JSON.parse(JSON.stringify(srv)), `seed ${seed}`).toEqual(JSON.parse(JSON.stringify(app)));
      const counts = { a: 1, b: 0, c: 2 };
      expect(server.validateCurriculum_(rows, TAGS, counts), `seed ${seed}`).toEqual(validateCurriculum(rows, TAGS, counts));
    }
  });

  it('sheet values: altijd | datum | bekend | dicht → codes; other text is kept (and fails validation)', () => {
    expect(['altijd', 'Datum ', 'bekend', 'dicht', 'soms', ''].map(server.ruleCode_)).toEqual(['always', 'date', 'known', 'closed', 'soms', '']);
  });
});

describe('migration from the old chain (migrateCurriculumRows_)', () => {
  const old = (order: number, tag: string, unlock_threshold: number, open = 'auto', max_wait_days: number | null = 21, active = true) =>
    ({ order, tag, unlock_threshold, max_wait_days, active, open });

  it('row N+1 = bekend round(100 × threshold of row N) van row N; threshold 0 / altijd open / first row → altijd', () => {
    const m = server.migrateCurriculumRows_([
      old(2, 'b', 0.8), old(1, 'a', 0), old(3, 'c', 0.75, 'auto', null), old(4, 'd', 0.8), old(5, 'e', 0.8, 'always')
    ]);
    expect(m.rows.map((r) => [r.tag, r.rule, r.percentage, r.from_tags.join(',')])).toEqual([
      ['a', 'always', null, ''],
      ['b', 'always', null, ''], // a's threshold was 0
      ['c', 'known', 80, 'b'],
      ['d', 'known', 75, 'c'],
      ['e', 'always', null, '']
    ]);
    expect(m.reliedOnWait).toEqual(['c']); // d's source c had no max_wait_days
  });

  it('old dicht → dicht; the rows that leaned on its cascade and inactive rows are listed', () => {
    const m = server.migrateCurriculumRows_([old(1, 'a', 0), old(2, 'b', 0.8, 'closed'), old(3, 'c', 0.8), old(4, 'd', 0.8, 'auto', 21, false)]);
    expect(m.rows.map((r) => r.rule)).toEqual(['always', 'closed', 'known', 'known']);
    expect(m.closed).toEqual(['b']);
    expect(m.belowClosed).toEqual(['c', 'd']);
    expect(m.inactive).toEqual(['d']);
  });
});
