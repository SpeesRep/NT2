import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDb, saveSnapshot } from './db';
import { createFlag, exportText, flagCardLabel, groupFlags, listFlags, openFlagCards, setCardResolved, setFlagNote, setFlagResolved, splitFlags } from './studentFlags';
import type { Card } from './types';

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id, type: 'word', nl: 'huis', article: 'het', pos: '', fr: 'la maison', example_nl: '', example_fr: '', tags: [],
  flags: [], answer: '', added: '2026-09-30', active: true, ...over
});
const at = (h: number) => new Date(Date.UTC(2026, 8, 30, h));

beforeEach(() => {
  indexedDB = new IDBFactory();
  _resetDb();
});

describe('student flags (🚩, local only)', () => {
  it('creates a flag instantly with no note, unresolved', async () => {
    const f = await createFlag('c_1', '', at(10));
    expect(f).toMatchObject({ card_id: 'c_1', note: '', resolved: false, ts: at(10).toISOString(), updated_ts: at(10).toISOString() });
    expect(f.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('flagging the same card again keeps both entries', async () => {
    await createFlag('c_1', '', at(10));
    await createFlag('c_1', 'weer vergeten', at(12));
    const all = await listFlags();
    expect(all.map((f) => f.card_id)).toEqual(['c_1', 'c_1']);
    expect(all[0].note).toBe('weer vergeten'); // newest first
  });

  it('adds a note to the same entry and trims it', async () => {
    const f = await createFlag('c_1', '', at(10));
    const g = await setFlagNote(f.id, "  waarom niet 'het'?  ", at(11));
    expect(g).toMatchObject({ id: f.id, note: "waarom niet 'het'?", updated_ts: at(11).toISOString(), ts: at(10).toISOString() });
    expect((await listFlags()).length).toBe(1);
  });

  it('resolve / unresolve never deletes; split into open and resolved', async () => {
    const a = await createFlag('c_1', '', at(10));
    await createFlag('c_2', '', at(11));
    await setFlagResolved(a.id, true, at(12));
    let { open, resolved } = splitFlags(await listFlags());
    expect(open.map((f) => f.card_id)).toEqual(['c_2']);
    expect(resolved.map((f) => f.card_id)).toEqual(['c_1']);
    await setFlagResolved(a.id, false, at(13));
    ({ open, resolved } = splitFlags(await listFlags()));
    expect(open.length).toBe(2);
    expect(resolved.length).toBe(0);
  });

  it('survives an app restart', async () => {
    await createFlag('c_1', 'x', at(10));
    _resetDb();
    expect((await listFlags())[0].note).toBe('x');
  });
});

describe('export text for "Delen"', () => {
  const cards = new Map([
    ['c_1', card('c_1')],
    ['K2-06', card('K2-06', { type: 'oneway', nl: '9:40u + 20 min = ...', article: '', fr: '', answer: '10:00u' })]
  ]);

  it('title, then one line per OPEN flag, newest first: word · note (no date)', () => {
    const flags = [
      { id: '1', card_id: 'c_1', ts: at(9).toISOString(), note: "waarom niet 'de'?", resolved: false, updated_ts: '' },
      { id: '2', card_id: 'K2-06', ts: at(11).toISOString(), note: '', resolved: false, updated_ts: '' },
      { id: '3', card_id: 'c_1', ts: at(12).toISOString(), note: 'al opgelost', resolved: true, updated_ts: '' }
    ];
    expect(exportText(flags, cards, 'SpeesRep')).toBe(
      ['SpeesRep', '9:40u + 20 min = ... (10:00u)', "het huis (la maison) · waarom niet 'de'?"].join('\n')
    );
  });

  it('a card that no longer exists is named by its id', () => {
    expect(flagCardLabel(undefined, 'c_gone')).toBe('c_gone');
  });

  it('a card that left the phone keeps its name: saved when flagged, and on every card refresh', async () => {
    await saveSnapshot([card('c_1'), card('c_2', { nl: 'boom', article: 'de', fr: "l'arbre" })], {});
    await createFlag('c_1', '', at(10)); // label saved now
    await (await import('./db')).db().then((d) => d.put('flags', { id: 'old', card_id: 'c_2', ts: at(9).toISOString(), note: '', resolved: false, updated_ts: '' }));
    await saveSnapshot([], {}); // both cards gone (e.g. not approved): the old flag gets its name first
    const groups = groupFlags(await listFlags());
    const cards = new Map<string, Card>();
    expect(groups.map((g) => flagCardLabel(cards.get(g.card_id), g.card_id, g.label))).toEqual(['het huis (la maison)', "de boom (l'arbre)"]);
    expect(exportText(await listFlags(), cards, 'SpeesRep')).toContain("de boom (l'arbre)");
  });
});

describe('one card marked several times counts once', () => {
  it('groups by card: one row, all notes, open while any flag is open', async () => {
    await createFlag('min', '', at(9));
    await createFlag('min', 'waarom "min"?', at(10));
    await createFlag('min', '', at(11));
    await createFlag('huis', '', at(12));
    const groups = groupFlags(await listFlags());
    expect(groups.map((g) => [g.card_id, g.flags.length, g.resolved])).toEqual([['huis', 1, false], ['min', 3, false]]);
    expect(groups[1].notes).toEqual(['waarom "min"?']);
    expect(openFlagCards(await listFlags()).size).toBe(2);
  });

  it('Opgelost resolves every open flag of the card; undo reopens it', async () => {
    await createFlag('min', '', at(9));
    await createFlag('min', '', at(10));
    let [g] = groupFlags(await listFlags());
    await setCardResolved(g, true, at(11));
    [g] = groupFlags(await listFlags());
    expect(g.resolved).toBe(true);
    expect(openFlagCards(await listFlags()).size).toBe(0);
    await setCardResolved(g, false, at(12));
    expect(groupFlags(await listFlags())[0].resolved).toBe(false);
  });

  it('shared text has one line per card', () => {
    const f = (id: string, card_id: string, h: number, note = '') => ({ id, card_id, ts: at(h).toISOString(), note, resolved: false, updated_ts: '' });
    const text = exportText([f('1', 'c_1', 9, 'een'), f('2', 'c_1', 10, 'twee'), f('3', 'c_1', 11)], new Map([['c_1', card('c_1')]]), 'T');
    expect(text).toBe('T\nhet huis (la maison) · twee / een');
  });
});
