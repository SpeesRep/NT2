import type { Card, Tag } from './types';
import { UI, t, type UIKey } from './i18n';

export function isNoun(card: Card): boolean {
  return card.article !== '' || /^noun/i.test(card.pos);
}

/** Dutch text as shown: nouns always with de/het; cloze braces removed. */
/** How a card is named in lists and shared text: "het huis (la maison)". */
export function cardLabel(card: Card): string {
  const nl = dutchText(card);
  const back = card.type === 'oneway' ? card.answer : card.fr;
  return back ? `${nl} (${back})` : nl;
}

export function dutchText(card: Card): string {
  const text = card.nl.replace(/[{}]/g, '');
  return card.type === 'word' && card.article ? `${card.article} ${text}` : text;
}

/**
 * Sheet flags that stay in the data but are not shown to the learner as a badge.
 * `separable` (scheidbaar werkwoord) is content metadata for the teacher only.
 */
export const HIDDEN_FLAGS = new Set(['separable']);

/** Badges to show on a card (sheet content flags minus the hidden ones). */
export function visibleFlags(card: Pick<Card, 'flags'>): string[] {
  return card.flags.filter((f) => !HIDDEN_FLAGS.has(f));
}

/** Dutch badge label for a flag from the sheet (unknown flags are shown as written). */
export function flagLabel(flag: string): string {
  const key = `flag.${flag}` as UIKey;
  return key in UI ? t(key) : flag;
}

/** Subject label above the card: subject_nl of the FIRST tag on the card that has one (or null). */
export function subjectFor(card: Pick<Card, 'tags'>, tags: Tag[]): string | null {
  const byTag = new Map(tags.map((t) => [t.tag, (t.subject_nl ?? '').trim()]));
  for (const tag of card.tags) {
    const s = byTag.get(tag);
    if (s) return s;
  }
  return null;
}

/** Cloze parts of a sentence card: "Ik {woon} hier." → before "Ik ", answer "woon", after " hier." */
export function clozeParts(nl: string): { before: string; answer: string; after: string } {
  const m = nl.match(/^(.*?)\{([^}]*)\}(.*)$/s);
  return m ? { before: m[1], answer: m[2], after: m[3] } : { before: nl, answer: '', after: '' };
}

/**
 * Is this card front a picture (an emoji, a regional-indicator letter, an OpenMoji private-use code point or
 * "openmoji:E0C0") rather than words? Such a front is ALWAYS shown as its OpenMoji picture, never as the phone's emoji.
 */
export function isPictureFront(text: string): boolean {
  const t = text.trim();
  if (/^openmoji:/i.test(t)) return true;
  return t !== '' && /^[\p{Extended_Pictographic}\p{Regional_Indicator}\u{E000}-\u{F8FF}\u200d\ufe0f\u{1F3FB}-\u{1F3FF}]+$/u.test(t);
}
