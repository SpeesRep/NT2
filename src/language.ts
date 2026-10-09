import { setMeta } from './db';
import { loadFromDb } from './store';
import { syncFonts } from './fonts';

/** Stores the help language on the device ('' = none), re-maps the cards' help texts and syncs the fonts. */
export async function setHelpLang(lang: string, groupLanguages: string[]): Promise<void> {
  await setMeta('helpLang', lang);
  await loadFromDb();
  void syncFonts(groupLanguages, lang);
}
