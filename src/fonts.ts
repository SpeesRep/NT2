// Fonts for non-Latin help languages (spec › Help languages). Latin languages (fr, en …) need none, so nothing is
// shipped yet. When a group gets e.g. Tigrinya or Arabic: put a font subset (only the characters used) in
// public/fonts/ and list it in FONT_FILES. Then:
//   - the app downloads the fonts of ALL the group's scripts (the same requests for every student, so they never
//     reveal the chosen language),
//   - and removes from its own cache the fonts the chosen language does not need.
// Fonts use the service worker's RUNTIME cache (FONT_CACHE, vite.config.ts), not the Workbox precache, because the
// precache cannot drop single files. A removed font is fetched again (when online) if the student switches back.
import { NS } from './config';

/** The script a help language needs a font for; Latin-script languages are not listed. */
export const SCRIPT_OF: Record<string, string> = {
  ar: 'Arab', fa: 'Arab', ps: 'Arab', ur: 'Arab', ckb: 'Arab', ti: 'Ethi', am: 'Ethi', uk: 'Cyrl', ru: 'Cyrl',
  he: 'Hebr', hi: 'Deva', zh: 'Hans', ta: 'Taml', bn: 'Beng', ka: 'Geor', hy: 'Armn'
};

/** Script → font files (paths under the app, e.g. 'fonts/NotoSansEthiopic-subset.woff2'). Empty: none shipped yet. */
export const FONT_FILES: Record<string, { family: string; files: string[] }> = {};

/** The runtime cache the service worker keeps fonts in (must match vite.config.ts › runtimeCaching). */
export const FONT_CACHE = `${NS}-fonts`;

/** Font files needed for these languages (deduplicated). */
export function fontFilesFor(languages: string[]): string[] {
  const out = new Set<string>();
  for (const l of languages) {
    const f = FONT_FILES[SCRIPT_OF[l] ?? ''];
    if (f) f.files.forEach((x) => out.add(x));
  }
  return [...out];
}

/**
 * Downloads every font of the group's languages, then deletes from the cache the ones `chosen` does not need, and
 * registers the needed ones with document.fonts (no inline CSS: the CSP allows fonts from this site only).
 * Safe offline (it just does less). Returns the files kept.
 */
export async function syncFonts(groupLanguages: string[], chosen: string, base = import.meta.env.BASE_URL): Promise<string[]> {
  const all = fontFilesFor(groupLanguages);
  const keep = fontFilesFor(chosen ? [chosen] : []);
  if (!all.length) return keep;
  await Promise.all(all.map((f) => fetch(base + f).catch(() => null))); // the service worker caches them
  try {
    const cache = await caches.open(FONT_CACHE);
    for (const f of all) if (!keep.includes(f)) await cache.delete(base + f, { ignoreSearch: true });
  } catch {
    /* no Cache API (private mode): nothing to remove */
  }
  const script = FONT_FILES[SCRIPT_OF[chosen] ?? ''];
  if (script && typeof FontFace !== 'undefined') {
    for (const f of script.files) {
      try {
        const face = new FontFace(script.family, `url(${base + f})`);
        document.fonts.add(await face.load());
      } catch {
        /* offline: the system font is used */
      }
    }
  }
  return keep;
}
