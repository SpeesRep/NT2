import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanCard, cleanSettings, cleanTranslations, parseContent } from './sync';
import { codeFromUrl, contentUrl, isCode, normalizeCode } from './group';
import { helpText, withHelpLang } from './helpLang';
import { _resetDb, allCards, getSettings, saveSnapshot } from './db';
import { byAdded } from './store';
import { dutchText, subjectFor, visibleFlags } from './display';
import type { Card } from './types';

const raw = (over: Partial<Card> = {}): Partial<Card> => ({
  id: 'c_1', type: 'word', nl: 'huis', article: 'het', pos: 'noun', help: '', help_example: '',
  translations: { fr: { text: 'la maison', example: '' }, en: { text: 'the house', example: '' } },
  example_nl: '', tags: ['household'], flags: [], added: '2026-09-28', active: true,
  ...over
});

describe('cleanCard', () => {
  it('keeps a valid card and records sheet order', () => {
    expect(cleanCard(raw(), 3)).toMatchObject({ id: 'c_1', article: 'het', order: 3 });
  });
  it('drops cards without id or Dutch text', () => {
    expect(cleanCard(raw({ id: '' }), 0)).toBeNull();
    expect(cleanCard(raw({ nl: '' }), 0)).toBeNull();
  });
  it('normalises bad values from the hand-edited sheet', () => {
    const c = cleanCard(raw({ type: 'banana' as never, article: 'le' as never, flags: [' False-Friend '] }), 0)!;
    expect(c.type).toBe('word');
    expect(c.article).toBe('');
    expect(c.flags).toEqual(['false-friend']);
  });
});

describe('cleanSettings', () => {
  it('fills defaults and clamps out-of-range values', () => {
    expect(cleanSettings({ new_per_day: 500, desired_retention: 2 } as never)).toMatchObject({
      new_per_day: 100, desired_retention: 0.97, show_french_help: true, due_window_minutes: 5, max_reviews_per_day: 100
    });
    expect(cleanSettings(undefined).new_per_day).toBe(10);
    expect(cleanSettings({ session_max_cards: 15, cooldown_minutes: 60 } as never)).not.toHaveProperty('session_max_cards');
    expect(cleanSettings({ show_french_help: false }).show_french_help).toBe(false);
  });
});

describe('ordering and display', () => {
  it('orders by added, then sheet order', () => {
    const a = { ...(raw({ id: 'a', added: '2026-09-28' }) as Card), order: 0 };
    const b = { ...(raw({ id: 'b', added: '2026-09-27' }) as Card), order: 5 };
    const c = { ...(raw({ id: 'c', added: '2026-09-27' }) as Card), order: 1 };
    expect([a, b, c].sort(byAdded).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('shows nouns with their article and strips cloze braces', () => {
    expect(dutchText(raw() as Card)).toBe('het huis');
    expect(dutchText(raw({ type: 'sentence', article: '', nl: 'Ik {woon} hier.' }) as Card)).toBe('Ik woon hier.');
  });
});

describe('saveSnapshot', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
    _resetDb();
  });

  it('replaces the whole card set and stores settings', async () => {
    await saveSnapshot([cleanCard(raw({ id: 'x' }), 0)!, cleanCard(raw({ id: 'y' }), 1)!], { settings: cleanSettings({ new_per_day: 5 }) });
    await saveSnapshot([cleanCard(raw({ id: 'y' }), 0)!], {});
    expect((await allCards()).map((c) => c.id)).toEqual(['y']);
    expect((await getSettings()).new_per_day).toBe(5);
  });
});

describe('subject label (first tag with a subject_nl)', () => {
  const tags = [
    { tag: 'app', label_nl: 'app', label_fr: '', subject_nl: 'App' },
    { tag: 'klok-3', label_nl: 'klok niveau 3', label_fr: '', subject_nl: 'De tijd' },
    { tag: 'wiskunde', label_nl: 'wiskunde', label_fr: '', subject_nl: '' },
    { tag: 'school', label_nl: 'school', label_fr: '' }
  ];
  it('uses the first tag on the card that has a subject', () => {
    expect(subjectFor({ tags: ['app', 'klok-3'] }, tags)).toBe('App');
    expect(subjectFor({ tags: ['klok-3', 'app'] }, tags)).toBe('De tijd');
  });
  it('skips tags without a subject (blank or missing)', () => {
    expect(subjectFor({ tags: ['wiskunde', 'school', 'klok-3'] }, tags)).toBe('De tijd');
  });
  it('no label when no tag has a subject, or the tag is unknown', () => {
    expect(subjectFor({ tags: ['wiskunde', 'school'] }, tags)).toBeNull();
    expect(subjectFor({ tags: ['onbekend'] }, tags)).toBeNull();
    expect(subjectFor({ tags: [] }, tags)).toBeNull();
  });
});

describe('badges shown to the learner', () => {
  it('"separable" (scheidbaar) stays in the data but is never shown; false-friend is', () => {
    expect(visibleFlags({ flags: ['separable'] })).toEqual([]);
    expect(visibleFlags({ flags: ['false-friend', 'separable'] })).toEqual(['false-friend']);
  });
});

describe('parseContent (a group\'s content.json)', () => {
  const file = (over: Record<string, unknown> = {}) => ({
    format: 1, code: 'abcdefgh', active: true, version: 'abc123', env: 'DEV', display_name: 'Groep Zon', languages: ['fr', 'en'],
    cards: [raw(), raw({ id: 'c_2', nl: 'tafel', active: false })], settings: { new_per_day: 7 },
    tags: [{ tag: 'household', label_nl: 'huis', labels: { fr: 'la maison', en: 'home' } }],
    curriculum: [{ order: 1, tag: 'household', rule: 'always' }],
    ...over
  });
  it('keeps the version, the group, the active cards with all translations', () => {
    const c = parseContent(file(), 'abcdefgh');
    expect(c.version).toBe('abc123');
    expect(c.group).toEqual({ code: 'abcdefgh', display_name: 'Groep Zon', languages: ['fr', 'en'] });
    expect(c.cards.map((x) => x.id)).toEqual(['c_1']);
    expect(c.cards[0].translations).toEqual({ fr: { text: 'la maison', example: '' }, en: { text: 'the house', example: '' } });
    expect(c.tags[0].labels).toEqual({ fr: 'la maison', en: 'home' });
    expect(c.settings.new_per_day).toBe(7);
  });
  it('refuses another group\'s file, an inactive stub, and anything that is not a word list', () => {
    expect(() => parseContent(file(), 'zzzzzzzz')).toThrow();
    expect(() => parseContent({ format: 1, code: 'abcdefgh', active: false }, 'abcdefgh')).toThrow();
    expect(() => parseContent(file({ version: '' }), 'abcdefgh')).toThrow();
    expect(() => parseContent(file({ cards: undefined }), 'abcdefgh')).toThrow();
    expect(() => parseContent(null, 'abcdefgh')).toThrow();
  });
  it('cleans translations (bad language keys and empty texts go)', () => {
    expect(cleanTranslations({ fr: { text: ' a ', example: '' }, 'x y': { text: 'b' }, en: { text: '', example: '' } })).toEqual({ fr: { text: 'a', example: '' } });
  });
});

describe('group code', () => {
  const base = '/NT2/dev/';
  it('normalises what a student types', () => {
    expect(normalizeCode(' AB3K 9MZQ ')).toBe('ab3k9mzq');
    expect(normalizeCode('ab3k-9mzq')).toBe('ab3k9mzq');
    expect(isCode('ab3k9mzq')).toBe(true);
    expect(isCode('ab3k9mz0')).toBe(false); // 0 is not in the alphabet
    expect(isCode('ab3k9mz')).toBe(false);
  });
  it('reads a code from a join link or a group page, nothing else', () => {
    expect(codeFromUrl('https://x.io/NT2/dev/?groep=AB3K9MZQ', base)).toBe('ab3k9mzq');
    expect(codeFromUrl('https://x.io/NT2/dev/g/ab3k9mzq/', base)).toBe('ab3k9mzq');
    expect(codeFromUrl('https://x.io/NT2/dev/', base)).toBeNull();
    expect(codeFromUrl('https://x.io/NT2/dev/?groep=nope', base)).toBeNull();
  });
  it('fetches only from the app\'s own site', () => {
    expect(contentUrl('ab3k9mzq', base)).toBe('/NT2/dev/g/ab3k9mzq/content.json');
  });
});

describe('help language', () => {
  const q = { ...raw({ id: 'q1', type: 'question', translations: { fr: { text: 'Quelle heure ?', example: '' } } }), help: '', help_example: '' } as Card;
  const w = { ...raw(), help: '', help_example: '' } as Card;
  it('maps the chosen language onto the card', () => {
    expect(withHelpLang([w], 'en')[0].help).toBe('the house');
    expect(withHelpLang([w], 'fr')[0].help).toBe('la maison');
    expect(withHelpLang([w], '')[0].help).toBe('');
  });
  it('leaves out a question card without a prompt in that language', () => {
    expect(withHelpLang([q, w], 'fr').map((c) => c.id)).toEqual(['q1', 'c_1']);
    expect(withHelpLang([q, w], 'en').map((c) => c.id)).toEqual(['c_1']);
    expect(withHelpLang([q, w], '').map((c) => c.id)).toEqual(['c_1']);
  });
  it('help panels exist in fr and en, none without a language', () => {
    expect(helpText('home', 'fr')).toMatch(/menu/);
    expect(helpText('home', 'en')).toMatch(/menu/);
    expect(helpText('home', '')).toBe('');
    expect(helpText('home', 'ti')).toBe('');
  });
});
