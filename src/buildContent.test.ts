import { describe, expect, it } from 'vitest';
// @ts-ignore — plain Node script without types
import { checkIds, lostIds, toContent } from '../scripts/build-content.mjs';

const card = (id: string, nl: string, fr = 'x') => ({ id, nl, fr, answer: '' });

describe('content.json build', () => {
  it('accepts random and hand-made ids', () => {
    expect(checkIds([card('c_0a1b2c3d4e', 'huis'), card('K-01', '09:00'), card('E-12', '🍎')])).toEqual([]);
  });
  it('refuses missing, duplicate and word-derived ids', () => {
    expect(checkIds([card('', 'huis')])[0]).toMatch(/without id/);
    expect(checkIds([card('c_1', 'huis'), card('c_1', 'tafel')])[0]).toMatch(/duplicate/);
    expect(checkIds([card('c_huis', 'huis')])[0]).toMatch(/derived/);
    expect(checkIds([card('maison-1', 'huis', 'la maison')])[0]).toMatch(/derived/);
    expect(checkIds([card('a b', 'huis')])[0]).toMatch(/bad id/);
  });
  it('version depends on the content only, not on the time', () => {
    const res = { cards: [card('c_1', 'huis')], settings: {}, tags: [], curriculum: [] };
    const a = toContent('dev', res);
    const b = toContent('dev', res);
    expect(a.version).toBe(b.version);
    expect(a.env).toBe('DEV');
    expect(toContent('dev', { ...res, cards: [card('c_1', 'huizen')] }).version).not.toBe(a.version);
  });
  it('reports ids that were published before and are gone', () => {
    expect(lostIds({ cards: [card('c_1', 'huis'), card('c_2', 'tafel')] }, { cards: [card('c_2', 'tafel')] })).toEqual(['c_1 (huis)']);
    expect(lostIds(null, { cards: [] })).toEqual([]);
  });
});
