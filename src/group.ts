// The student's group (spec › Student app). The 8-character group code is the ONLY thing that ties a device to a
// group; it is stored on the device (meta.groupCode) and never sent anywhere — the app only GETs
// <base>g/<code>/content.json from its own site. No group list exists: a 404 means an unknown code.

export const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (no 0/o, 1/l/i)
export const CODE_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

/** What a student types → a code: lower case, no spaces or dashes ("AB3K 9MZQ" → "ab3k9mzq"). */
export function normalizeCode(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[\s-]+/g, '');
}

export function isCode(s: string): boolean {
  return CODE_RE.test(s);
}

/** A code from a join link (…/?groep=<code>) or a group page (…/g/<code>/), else null. */
export function codeFromUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href);
    const q = normalizeCode(u.searchParams.get('groep') ?? '');
    if (isCode(q)) return q;
    const m = u.pathname.slice(base.length - 1).match(/^\/g\/([^/]+)\/?/);
    const p = m ? normalizeCode(m[1]) : '';
    return isCode(p) ? p : null;
  } catch {
    return null;
  }
}

/** The group's word list, on the app's own origin. */
export function contentUrl(code: string, base = import.meta.env.BASE_URL): string {
  return `${base}g/${code}/content.json`;
}
