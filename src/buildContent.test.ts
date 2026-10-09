import { describe, expect, it } from 'vitest';
// @ts-ignore — plain Node script without types
import { checkExport, checkIds, groupPage, lostIds, toContent } from '../scripts/build-content.mjs';

const card = (id: string, nl: string, fr = 'x') => ({ id, nl, fr, answer: '', tags: ['huis'] });
const group = (over: Record<string, unknown> = {}) => ({
  code: 'abcdefgh', active: true, display_name: 'Groep Zon', languages: ['fr', 'en'], cards: [card('c_0a1b2c3d4e', 'huis')],
  settings: {}, tags: [], curriculum: [], ...over
});

describe('per-group content.json', () => {
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
    const a = toContent('dev', group());
    expect(a.version).toBe(toContent('dev', group()).version);
    expect(a).toMatchObject({ format: 1, code: 'abcdefgh', active: true, env: 'DEV', display_name: 'Groep Zon', languages: ['fr', 'en'] });
    expect(toContent('dev', group({ cards: [card('c_0a1b2c3d4e', 'huizen')] })).version).not.toBe(a.version);
  });
  it('an inactive group is a stub without content', () => {
    expect(toContent('prod', { code: 'abcdefgh', active: false })).toEqual({ format: 1, code: 'abcdefgh', active: false });
  });
  it('stops the publish on a wrong env, bad or duplicate codes, or bad ids', () => {
    expect(checkExport('dev', { env: 'DEV', groups: [group()] })).toEqual([]);
    expect(checkExport('dev', { env: 'PROD', groups: [] })[0]).toMatch(/answered as PROD/);
    expect(checkExport('dev', { env: 'DEV', groups: [group({ code: 'ABC' })] })[0]).toMatch(/bad group code/);
    expect(checkExport('dev', { env: 'DEV', groups: [group(), group()] })[0]).toMatch(/duplicate group code/);
    expect(checkExport('dev', { env: 'DEV', groups: [group({ cards: [card('c_huis', 'huis')] })] })[0]).toMatch(/abcdefgh: .*derived/);
    expect(checkExport('dev', { env: 'DEV', groups: [{ code: 'abcdefgh', active: false }] })).toEqual([]);
  });
  it('reports ids that were published before and are gone', () => {
    expect(lostIds({ cards: [card('c_1', 'huis'), card('c_2', 'tafel')] }, { cards: [card('c_2', 'tafel')] })).toEqual(['c_1 (huis)']);
    expect(lostIds(null, { cards: [] })).toEqual([]);
  });
});

describe('group install page', () => {
  const html = '<head><link rel="manifest" href="/NT2/dev/manifest.webmanifest"></head>';
  const manifest = JSON.stringify({ id: '/NT2/dev/', start_url: '/NT2/dev/', scope: '/NT2/dev/', icons: [{ src: 'icons/dev/icon-192.png' }, { src: '/abs.png' }] });
  it('points the page at its own manifest whose start_url carries the code', () => {
    const p = groupPage(html, manifest, '/NT2/dev/', 'abcdefgh')!;
    expect(p.html).toContain('<link rel="manifest" href="manifest.webmanifest">');
    const m = JSON.parse(p.manifest);
    expect(m).toMatchObject({ id: '/NT2/dev/?groep=abcdefgh', start_url: '/NT2/dev/?groep=abcdefgh', scope: '/NT2/dev/' });
    expect(m.icons.map((i: { src: string }) => i.src)).toEqual(['/NT2/dev/icons/dev/icon-192.png', '/abs.png']);
  });
  it('makes no page without a built app (PROD placeholder)', () => {
    expect(groupPage('<p>La version PROD arrive bientôt.</p>', '', '/NT2/', 'abcdefgh')).toBeNull();
  });
});
