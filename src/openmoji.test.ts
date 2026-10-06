import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPENMOJI, openmojiFor } from './openmoji';

const root = join(__dirname, '..');

describe('OpenMoji pictures (self-hosted)', () => {
  it('finds the picture with or without the FE0F selector; other text has none', () => {
    expect(openmojiFor('🛏️')).toBe('1F6CF');
    expect(openmojiFor('🛏')).toBe('1F6CF');
    expect(openmojiFor('het bed')).toBeNull();
  });

  it('an OpenMoji-only picture is written "openmoji:<hexcode>" (case-insensitive); an unknown one has none', () => {
    expect(openmojiFor('openmoji:E0C0')).toBe('E0C0');
    expect(openmojiFor(' openmoji:e0c0 ')).toBe('E0C0');
    expect(openmojiFor('openmoji:E1DB')).toBeNull(); // not in OpenMoji 17.0.0
  });

  it('every emoji in scripts/openmoji-extra.json has a picture (also regional-indicator letters for the alphabet)', () => {
    const extra = JSON.parse(readFileSync(join(root, 'scripts/openmoji-extra.json'), 'utf8')) as Record<string, string[] | string>;
    const all = Object.entries(extra).filter(([k]) => !k.startsWith('_')).flatMap(([, v]) => v as string[]);
    for (const e of all) expect(openmojiFor(/^E[0-9A-F]{3}/i.test(e) ? `openmoji:${e}` : e), e).not.toBeNull();
    expect(openmojiFor('🇦')).toBe('1F1E6');
  });


  it('every emoji card in the seeds has a picture, and only used SVGs are shipped', () => {
    const schema = readFileSync(join(root, 'apps-script/Schema.gs'), 'utf8');
    const block = schema.slice(schema.indexOf('var EMOJI_SEED_CARDS'), schema.indexOf('];', schema.indexOf('var EMOJI_SEED_CARDS')));
    const emojis = [...block.matchAll(/'E-\d+\|([^|]+)\|/g)].map((m) => m[1]);
    for (const e of emojis) expect(openmojiFor(e), e).not.toBeNull();
    const shipped = readdirSync(join(root, 'public/openmoji')).filter((f) => f.endsWith('.svg')).sort();
    expect(shipped).toEqual([...new Set(Object.values(OPENMOJI))].map((h) => `${h}.svg`).sort());
    for (const f of shipped) {
      const svg = readFileSync(join(root, 'public/openmoji', f), 'utf8');
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); // nothing loaded from another origin
    }
    expect(existsSync(join(root, 'public/openmoji/LICENSE.txt'))).toBe(true);
  });
});
