import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Teacher curriculum editor: the server-side save plan + version stamp (apps-script/CurriculumEditor.gs) and the
// page's pure logic (apps-script/CurriculumLogic.html), loaded as they are deployed.

const dir = join(__dirname, '..', 'apps-script');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
const script = (f: string) => read(f).replace(/<\/?script>/g, '');
type Row = { order?: number; tag: string; rule: string; date: string; percentage: number | null; from_tags: string[] };
type Check = { errors: string[]; warnings: string[] };
// eslint-disable-next-line no-new-func
const gs = new Function(`var Utilities, Session; ${read('Util.gs')}\n${read('Curriculum.gs')}\n${read('CurriculumEditor.gs')};
  return { curriculumSavePlan_, curriculumVersion_ };`)() as {
  curriculumSavePlan_: (rows: unknown[], tagKeys: string[], counts?: Record<string, number>) => { ok: boolean; checks: Check[]; rows: Row[] };
  curriculumVersion_: (values: unknown[][]) => string;
};
// eslint-disable-next-line no-new-func
const page = new Function(`${script('TeacherStrings.html')}\n${script('CurriculumLogic.html')}; return { CurLogic, tr };`)() as {
  tr: (k: string, v?: Record<string, unknown>) => string;
  CurLogic: {
    setRule: (r: Row, rule: string) => Row;
    move: (rows: Row[], i: number, dir: number) => { rows: Row[]; dropped: string[] };
    add: (rows: Row[], tag: string) => Row[];
    candidates: (rows: Row[], i: number) => string[];
    sentence: (r: Row, tr: unknown) => string;
    preview: (r: Row, ctx: { today: string; scores: Record<string, number> | null }, tr: unknown) => string;
    forSave: (rows: Row[]) => Row[];
  };
};
const { CurLogic: L, tr } = page;

const TAGS = ['app', 'klok-1', 'klok-2', 'sport'];
const row = (tag: string, rule: string, over: Partial<Row> = {}): Row => ({ tag, rule, date: '', percentage: null, from_tags: [], ...over });

describe('save plan (server): the shared validation decides, nothing is written on errors', () => {
  const plan = (rows: Row[]) => gs.curriculumSavePlan_(L.forSave(rows), TAGS, { app: 5, 'klok-1': 3, 'klok-2': 2 });

  it('a valid list saves; order = position; warnings do not block', () => {
    const p = plan([row('app', 'always'), row('klok-1', 'altijd'), row('klok-2', 'known', { percentage: 80, from_tags: ['klok-1'] }), row('sport', 'closed')]);
    expect(p.ok).toBe(true);
    expect(p.rows.map((r) => [r.order, r.rule])).toEqual([[1, 'always'], [2, 'always'], [3, 'known'], [4, 'closed']]);
    expect(p.checks[3].warnings).toEqual([]); // dicht: no checks at all
  });

  it('loops are impossible: a van_tag below the row is an error', () => {
    const p = plan([row('klok-2', 'known', { percentage: 80, from_tags: ['klok-1'] }), row('klok-1', 'known', { percentage: 80, from_tags: ['klok-2'] })]);
    expect(p.ok).toBe(false);
    expect(p.checks[0].errors).toEqual(['van_tags: "klok-1" moet hoger in de lijst staan dan "klok-2".']);
  });

  it('unknown tags, missing percentage or date', () => {
    const p = plan([row('app', 'always'), row('nieuw', 'always'), row('klok-1', 'known', { from_tags: ['app'] }), row('klok-2', 'date')]);
    expect(p.checks.map((c) => c.errors)).toEqual([
      [],
      ['Tag "nieuw" staat niet in het tabblad Tags.'],
      ['Regel bekend: vul een percentage in van 1 tot 100.'],
      ['Regel datum: vul een geldige datum in.']
    ]);
  });

  it('duplicate order (hand-edited input) is an error on both rows', () => {
    const p = gs.curriculumSavePlan_([{ ...row('app', 'always'), order: 1 }, { ...row('sport', 'always'), order: 1 }], TAGS);
    expect(p.checks.map((c) => c.errors)).toEqual([['Order 1 komt meer dan één keer voor.'], ['Order 1 komt meer dan één keer voor.']]);
  });

  it('warning for a topic without active cards, and for waiting on a dicht topic', () => {
    const p = plan([row('app', 'closed'), row('sport', 'known', { percentage: 50, from_tags: ['app'] })]);
    expect(p.ok).toBe(true);
    expect(p.checks[1].warnings).toEqual(['sport wacht op app, dat nu dicht is.', 'Dit onderwerp heeft geen actieve kaarten.']);
  });
});

describe('version stamp: a change by someone else is detected', () => {
  it('same values → same stamp; any changed cell → another stamp', () => {
    const a = [[1, 'app', 'altijd', '', '', '']];
    expect(gs.curriculumVersion_(a)).toBe(gs.curriculumVersion_([[1, 'app', 'altijd', '', '', '']]));
    expect(gs.curriculumVersion_(a)).not.toBe(gs.curriculumVersion_([[1, 'app', 'dicht', '', '', '']]));
    expect(gs.curriculumVersion_(a)).not.toBe(gs.curriculumVersion_([...a, [2, 'sport', 'altijd', '', '', '']]));
  });
});

describe('editor logic (page)', () => {
  it('switching the rule keeps the hidden values; switching back restores them', () => {
    const k = row('klok-2', 'known', { percentage: 80, from_tags: ['klok-1'], date: '2026-11-16' });
    const parked = L.setRule(k, 'closed');
    expect(parked).toMatchObject({ rule: 'closed', percentage: 80, from_tags: ['klok-1'], date: '2026-11-16' });
    expect(L.setRule(L.setRule(parked, 'date'), 'known')).toEqual(k);
  });

  it('the multi-select only offers topics above; moving a row drops van_tags no longer above and says so', () => {
    const rows = [row('app', 'always'), row('klok-1', 'always'), row('klok-2', 'known', { percentage: 80, from_tags: ['klok-1', 'app'] })];
    expect(L.candidates(rows, 2)).toEqual(['app', 'klok-1']);
    const up = L.move(rows, 2, -1); // klok-2 above klok-1
    expect(up.rows.map((r) => r.tag)).toEqual(['app', 'klok-2', 'klok-1']);
    expect(up.rows[1].from_tags).toEqual(['app']);
    expect(up.dropped).toEqual(['klok-2: klok-1']);
  });

  it('reordering never touches the van_tags of a dicht row', () => {
    const rows = [row('app', 'always'), row('klok-2', 'closed', { percentage: 80, from_tags: ['app'] })];
    expect(L.move(rows, 1, -1)).toEqual({ rows: [rows[1], rows[0]], dropped: [] });
  });

  it('a new subject (or one without a row) is added at the bottom as dicht', () => {
    const rows = [row('app', 'always'), row('klok-2', 'known', { percentage: 80, from_tags: ['app'] })];
    expect(L.add(rows, 'sport')[2]).toEqual(row('sport', 'closed'));
  });

  it('sentences and preview lines', () => {
    expect(L.sentence(row('a', 'always'), tr)).toBe('Altijd open');
    expect(L.sentence(row('a', 'date', { date: '2026-11-16' }), tr)).toBe('Opent op 16 november 2026');
    expect(L.sentence(row('a', 'known', { percentage: 80, from_tags: ['klok-1', 'app'] }), tr)).toBe('Opent als 80% bekend is van: klok-1, app');
    expect(L.sentence(row('a', 'closed'), tr)).toBe('Dicht');
    const ctx = { today: '2026-10-05', scores: { 'klok-1': 0.62 } };
    expect(L.preview(row('a', 'date', { date: '2026-10-17' }), ctx, tr)).toBe('Opent over 12 dagen');
    expect(L.preview(row('a', 'date', { date: '2026-10-01' }), ctx, tr)).toBe('Staat open');
    expect(L.preview(row('a', 'known', { percentage: 80, from_tags: ['klok-1'] }), ctx, tr)).toBe('klok-1: 62% van 80%');
    expect(L.preview(row('a', 'known', { percentage: 80, from_tags: ['klok-1'] }), { ...ctx, scores: null }, tr)).toBe('voortgang staat alleen op de telefoon');
    expect(L.preview(row('a', 'closed'), ctx, tr)).toBe('Dicht: wordt niet aangeboden.');
  });
});
