import { describe, expect, it } from 'vitest';
import { dutchSpeech, isListeningReview, pickDutchVoice } from './tts';
import type { Card } from './types';

const v = (lang: string, name = lang, localService = true) => ({ lang, name, localService });
const card = (over: Partial<Card>): Card =>
  ({ id: 'c1', type: 'word', nl: 'huis', article: 'het', pos: '', fr: 'maison', example_nl: '', example_fr: '', tags: [], flags: [], answer: '', added: '', active: true, ...over }) as Card;

describe('Dutch voice', () => {
  it('prefers nl-NL, then nl-BE, then any nl; local voices first', () => {
    expect(pickDutchVoice([v('fr-FR'), v('nl-BE'), v('nl-NL')])?.lang).toBe('nl-NL');
    expect(pickDutchVoice([v('en-US'), v('nl_BE')])?.lang).toBe('nl_BE');
    expect(pickDutchVoice([v('nl-NL', 'online', false), v('nl-NL', 'local', true)])?.name).toBe('local');
  });
  it('no Dutch voice → null (the app then shows the message and skips listening cards)', () => {
    expect(pickDutchVoice([v('fr-FR'), v('en-GB')])).toBeNull();
    expect(pickDutchVoice([])).toBeNull();
  });
});

describe('what is spoken', () => {
  it('nouns with their article; never the French part', () => {
    expect(dutchSpeech(card({}))).toBe('het huis');
    expect(dutchSpeech(card({ type: 'oneway', nl: 'min (- afkorting)', answer: 'de minuut, de minuten — minute(s)' }))).toBe('de minuut, de minuten');
    expect(dutchSpeech(card({ type: 'oneway', nl: '🛏️', answer: 'het bed' }))).toBe('het bed');
    expect(dutchSpeech(card({ type: 'sentence', article: '', nl: 'Ik {woon} hier.' }))).toBe('Ik woon hier.');
  });
});

describe('listening cards', () => {
  it('about `share` of word-recognition reviews, deterministic, never for other types', () => {
    const cards = Array.from({ length: 1000 }, (_, i) => card({ id: `c${i}` }));
    const n = cards.filter((c) => isListeningReview(c, 1, 0.3)).length;
    expect(n).toBeGreaterThan(220);
    expect(n).toBeLessThan(380);
    expect(isListeningReview(cards[5], 2, 0.3)).toBe(isListeningReview(cards[5], 2, 0.3));
    expect(isListeningReview(card({ type: 'oneway' }), 1, 1)).toBe(false);
    expect(isListeningReview(cards[0], 1, 0)).toBe(false);
  });
});
