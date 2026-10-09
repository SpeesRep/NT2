import { HELP, RATINGS, type HelpScreen } from './i18n';
import type { Card } from './types';

// Help languages (spec › Help languages). The Dutch interface stays; the Hulp panel, the rating overlay and the
// card's help side show the language the student chose (stored on the device only, meta.helpLang; '' = none).
// Text for ALL of the group's languages stays on the device, so switching works offline.

/** Names of help languages in their own language (the choice list). Unknown codes show the code itself. */
export const LANG_NAMES: Record<string, string> = {
  fr: 'Français', en: 'English', ar: 'العربية', ti: 'ትግርኛ', am: 'አማርኛ', uk: 'Українська', ru: 'Русский', tr: 'Türkçe',
  es: 'Español', pt: 'Português', de: 'Deutsch', pl: 'Polski', fa: 'فارسی', so: 'Soomaali', ps: 'پښتو'
};

export function langName(code: string): string {
  return LANG_NAMES[code] ?? code;
}

/**
 * Cards as the student sees them: help/help_example from the chosen language. A question card shows its help
 * text as the front, so without one it is left out (a card without a translation otherwise still works).
 */
export function withHelpLang(cards: Card[], lang: string): Card[] {
  return cards
    .map((c) => {
      const tr = lang ? c.translations?.[lang] : undefined;
      return { ...c, help: tr?.text ?? '', help_example: tr?.example ?? '' };
    })
    .filter((c) => c.type !== 'question' || c.help !== '');
}

/** The Hulp text of a screen in the help language ('' = no panel). */
export function helpText(screen: HelpScreen, lang: string): string {
  const h = HELP[screen] as Record<string, string>;
  return lang ? (h[lang] ?? '') : '';
}

/** The meaning of a rating button in the help language ('' when there is none). */
export function ratingMeaning(r: (typeof RATINGS)[number], lang: string): string {
  return lang ? ((r as Record<string, unknown>)[lang] as string | undefined) ?? '' : '';
}
