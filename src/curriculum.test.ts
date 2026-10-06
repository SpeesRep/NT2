import { describe, expect, it } from 'vitest';
import { curriculumStatus, makePicker, topicChoices, validateCurriculum } from './curriculum';
import { progressKey, type Progress } from './scheduler';
import { planToday, todaysIntro } from './session';
import type { Card, CurriculumRow } from './types';

const now = new Date('2026-10-20T12:00:00Z');
const today = '2026-10-20';
const known = { known_stability_days: 7, known_min_reviews: 2 };
const card = (id: string, tags: string[], type: Card['type'] = 'question', added = '2026-09-29'): Card =>
  ({ id, type, nl: id, article: '', pos: '', fr: id, example_nl: '', example_fr: '', tags, flags: [], answer: '', added, active: true }) as Card;
const row = (order: number, tag: string, rule: string, over: Partial<CurriculumRow> = {}): CurriculumRow => ({
  order, tag, rule, date: '', percentage: null, from_tags: [], ...over
});
const always = (o: number, t: string) => row(o, t, 'always');
const knownRow = (o: number, t: string, pct: number, from: string[]) => row(o, t, 'known', { percentage: pct, from_tags: from });
const prog = (id: string, stability: number, reps: number, track: 'recog' | 'prod' = 'prod'): [string, Progress] => [
  progressKey(id, track),
  { key: progressKey(id, track), card_id: id, track, state: 'Review', due: '2026-10-30T00:00:00Z', stability, difficulty: 5, reps, lapses: 0,
    last_review: '2026-10-19T00:00:00Z', learning_steps: 0, scheduled_days: 10 }
];
const TAGS = ['a', 'b', 'c', 'd', 'huishouden'];
const run = (rows: CurriculumRow[], cards: Card[], progress = new Map<string, Progress>(), opened: Record<string, string> = {}, day = today) =>
  curriculumStatus(rows, cards, progress, known, day, opened, TAGS);
const openOf = (r: ReturnType<typeof run>) => r.rows.map((s) => `${s.tag}:${s.open}`);

describe('bekend', () => {
  it('stability >= known_stability_days AND reps >= known_min_reviews; score = bekend / cards', () => {
    const cards = ['a1', 'a2', 'a3', 'a4'].map((id) => card(id, ['a']));
    const r = run([always(1, 'a')], cards, new Map([prog('a1', 7, 2), prog('a2', 30, 5), prog('a3', 40, 1), prog('a4', 6, 9)]));
    expect(r.rows[0].known).toBe(2); // a3 too few reviews, a4 too little stability
    expect(r.rows[0].score).toBe(0.5);
  });

  it('words count by their recognition track; a tag without cards scores 100 %', () => {
    const r = run([always(1, 'a'), always(2, 'b')], [card('w', ['a'], 'word')], new Map([prog('w', 30, 3, 'recog')]));
    expect(r.rows.map((s) => s.score)).toEqual([1, 1]);
  });
});

describe('the rules', () => {
  const cards = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => card(id, ['a'])).concat([card('b1', ['b']), card('c1', ['c'])]);

  it('altijd: open from the start; the row above never decides', () => {
    expect(openOf(run([knownRow(1, 'a', 100, []), always(2, 'b')], cards))).toEqual(['a:false', 'b:true']);
  });

  it('datum: opens at local midnight of that date (the phone\'s local date)', () => {
    const rows = [always(1, 'a'), row(2, 'b', 'date', { date: '2026-10-21' })];
    expect(run(rows, cards, undefined, {}, '2026-10-20').rows[1]).toMatchObject({ open: false, state: 'date' });
    expect(run(rows, cards, undefined, {}, '2026-10-21').rows[1]).toMatchObject({ open: true, state: 'open' });
  });

  it('bekend: opens when the van_tag reaches the percentage', () => {
    const rows = [always(1, 'a'), knownRow(2, 'b', 80, ['a'])];
    const three = new Map(['a1', 'a2', 'a3'].map((id) => prog(id, 30, 3)));
    expect(run(rows, cards, three).rows[1]).toMatchObject({ open: false, state: 'waiting', fromScores: [{ tag: 'a', score: 0.6 }] });
    const four = new Map(['a1', 'a2', 'a3', 'a4'].map((id) => prog(id, 30, 3)));
    expect(run(rows, cards, four).rows[1].open).toBe(true); // 4/5 = 80 %
  });

  it('bekend with several van_tags: ALL must pass', () => {
    const rows = [always(1, 'a'), always(2, 'b'), knownRow(3, 'c', 50, ['a', 'b'])];
    const aOnly = new Map(['a1', 'a2', 'a3'].map((id) => prog(id, 30, 3)));
    expect(run(rows, cards, aOnly).rows[2].open).toBe(false); // b: 0 %
    aOnly.set(...prog('b1', 30, 3));
    expect(run(rows, cards, aOnly).rows[2].open).toBe(true);
  });
});

describe('latch (meta.curriculumOpened)', () => {
  const cards = [card('a1', ['a']), card('a2', ['a']), card('b1', ['b'])];
  const rows = [always(1, 'a'), knownRow(2, 'b', 50, ['a'])];

  it('a topic that opens is latched with the date; it survives a score drop', () => {
    const r = run(rows, cards, new Map([prog('a1', 30, 3)]));
    expect(r.opened).toEqual({ a: today, b: today });
    const lapse = run(rows, cards, new Map([prog('a1', 1, 4)]), r.opened); // a1 forgotten → a 0 %
    expect(lapse.rows[1]).toMatchObject({ open: true, latched: true });
  });

  it('a deleted row or a future date stays open only when latched', () => {
    const later = [always(1, 'a'), row(2, 'b', 'date', { date: '2027-01-01' })];
    expect(run(later, cards).rows[1].open).toBe(false);
    expect(run(later, cards, undefined, { b: '2026-10-01' }).rows[1].open).toBe(true);
    expect(run([always(1, 'a')], cards, undefined, { b: '2026-10-01' }).open).toEqual(['a', 'b']);
    expect(run([always(1, 'a')], cards).open).toEqual(['a']);
  });
});

describe('dicht', () => {
  const cards = [card('a1', ['a']), card('b1', ['b']), card('c1', ['c'])];

  it('ignores invalid other columns (no error) and is never open', () => {
    const rows = [always(1, 'a'), row(2, 'b', 'closed', { date: 'nonsense', percentage: 900, from_tags: ['zzz', 'c'] })];
    const r = run(rows, cards);
    expect(r.rows[1]).toMatchObject({ open: false, state: 'closed', errors: [], warnings: [] });
    expect(r.rows[1].from_tags).toEqual(['zzz', 'c']); // kept, only ignored
  });

  it('overrides an existing latch and clears it; switching away re-evaluates from scratch', () => {
    const closed = run([always(1, 'a'), row(2, 'b', 'closed')], cards, undefined, { a: '2026-10-01', b: '2026-10-01' });
    expect(closed.rows[1].open).toBe(false);
    expect(closed.opened).toEqual({ a: '2026-10-01' });
    const back = run([always(1, 'a'), knownRow(2, 'b', 80, ['a'])], cards, undefined, closed.opened);
    expect(back.rows[1]).toMatchObject({ open: false, latched: false, state: 'waiting' });
  });

  it('has no cascade: rows below still follow their own rule', () => {
    expect(openOf(run([row(1, 'a', 'closed'), always(2, 'b')], cards))).toEqual(['a:false', 'b:true']);
  });

  it('is not listed in "Kies een onderwerp"; a topic that opens later shows 🔒', () => {
    const r = run([always(1, 'a'), row(2, 'b', 'closed'), row(3, 'c', 'date', { date: '2027-01-01' })], cards);
    expect(topicChoices(r)).toEqual([{ tag: 'a', locked: false }, { tag: 'c', locked: true }]);
  });

  it('a row waiting for a dicht topic gets a warning (not an error) and still counts as valid', () => {
    const v = validateCurriculum([row(1, 'a', 'closed'), knownRow(2, 'b', 80, ['a'])], TAGS);
    expect(v[1]).toEqual({ errors: [], warnings: ['b wacht op a, dat nu dicht is.'] });
  });
});

describe('broken rows', () => {
  const cards = [card('a1', ['a']), card('b1', ['b']), card('c1', ['c'])];
  const broken: [string, CurriculumRow][] = [
    ['bekend without van_tags', knownRow(2, 'b', 80, [])],
    ['bekend without percentage', row(2, 'b', 'known', { from_tags: ['a'] })],
    ['datum without a valid date', row(2, 'b', 'date', { date: '2026-02-30' })],
    ['unknown regel', row(2, 'b', 'soms')]
  ];
  for (const [name, bad] of broken) {
    it(`${name}: closed, other rows still open`, () => {
      const r = run([always(1, 'a'), bad, always(3, 'c')], cards);
      expect(r.rows[1]).toMatchObject({ open: false, state: 'error' });
      expect(r.rows[1].errors.length).toBeGreaterThan(0);
      expect(openOf(r)).toEqual(['a:true', 'b:false', 'c:true']);
    });
  }

  it('an existing latch survives a broken row (no new latch)', () => {
    const rows = [always(1, 'a'), knownRow(2, 'b', 80, [])];
    expect(run(rows, cards, undefined, { b: '2026-10-01' }).rows[1].open).toBe(true);
    expect(run(rows, cards).opened).toEqual({ a: today });
  });
});

describe('validation messages', () => {
  it('unknown tags, van_tags only above, missing percentage/date, duplicate order and tag', () => {
    const v = validateCurriculum([
      always(1, 'a'),
      knownRow(2, 'b', 80, ['c']), // c is below → loop impossible
      knownRow(3, 'c', 80, ['b', 'nieuw', 'd']),
      row(3, 'zzz', 'always'),
      row(5, 'a', 'date'),
      row(6, 'huishouden', 'known', { from_tags: ['a'] })
    ], TAGS, { a: 3, b: 1, c: 1 });
    expect(v[0]).toEqual({ errors: [], warnings: [] });
    expect(v[1].errors).toEqual(['van_tags: "c" moet hoger in de lijst staan dan "b".']);
    expect(v[2].errors).toEqual([
      'Order 3 komt meer dan één keer voor.',
      'van_tags: "nieuw" staat niet in het tabblad Tags.',
      'van_tags: "d" staat niet in het curriculum.'
    ]);
    expect(v[3].errors).toEqual(['Tag "zzz" staat niet in het tabblad Tags.', 'Order 3 komt meer dan één keer voor.']);
    expect(v[4].errors).toEqual(['Tag "a" staat al hoger in het curriculum.', 'Regel datum: vul een geldige datum in.']);
    expect(v[5].errors).toEqual(['Regel bekend: vul een percentage in van 1 tot 100.']);
    expect(v[5].warnings).toEqual(['Dit onderwerp heeft geen actieve kaarten.']);
  });
});

describe('picking new cards', () => {
  it('untagged cards and tags without a row are never introduced', () => {
    const cards = [card('a1', ['a']), card('h1', ['huishouden']), card('u1', [])];
    const p = makePicker(run([always(1, 'a')], cards).open);
    expect(cards.filter(p.eligible).map((c) => c.id)).toEqual(['a1']);
  });

  it('fills slots from the open topics in order; a multi-tag card comes once', () => {
    const cards = [
      card('b1', ['b'], 'question', '2026-09-01'),
      card('ab', ['a', 'b'], 'question', '2026-09-02'),
      card('a1', ['a'], 'question', '2026-09-03')
    ];
    const r = run([always(1, 'a'), always(2, 'b')], cards);
    const picked = makePicker(r.open).pickNew(cards, 10).map((c) => c.id);
    expect(picked).toEqual(['ab', 'a1', 'b1']);
    expect(makePicker(r.open).pickNew(cards, 2).map((c) => c.id)).toEqual(['ab', 'a1']);
  });

  it('plugs into the daily plan: due cards of a closed topic keep coming, new ones do not', () => {
    const cards = [card('b1', ['b']), card('b2', ['b']), card('a1', ['a'])];
    const progress = new Map([prog('b1', 1, 1)]);
    progress.get(progressKey('b1', 'prod'))!.due = '2026-10-19T00:00:00Z';
    const picker = makePicker(run([always(1, 'a'), row(2, 'b', 'closed')], cards, progress).open);
    const plan = planToday(cards, progress, { new_per_day: 5, unlock_prod_stability_days: 3, due_window_minutes: 10, max_reviews_per_day: 100 }, todaysIntro(undefined, now), now, { pickNew: picker.pickNew });
    expect(plan.due.map((i) => i.card.id)).toEqual(['b1']);
    expect(plan.fresh.map((i) => i.card.id)).toEqual(['a1']);
  });
});
