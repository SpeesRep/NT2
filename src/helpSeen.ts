import { NS } from './config';

// "Hulp is new": remember a fingerprint of each screen's help text when she opens it. When a new version
// changes that text, the Hulp button shows "nieuw" until she opens it again. Screens she never opened are
// not flagged (everything would look new on a first install).

export function fingerprint(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Updated = she has seen an earlier version of this help text and it changed since. */
export function isHelpUpdated(seen: string | null, text: string): boolean {
  return seen !== null && seen !== fingerprint(text);
}

const key = (screen: string) => `${NS}:help-seen:${screen}`;

export function helpSeen(screen: string): string | null {
  try {
    return localStorage.getItem(key(screen));
  } catch {
    return null;
  }
}

export function markHelpSeen(screen: string, text: string) {
  try {
    localStorage.setItem(key(screen), fingerprint(text));
  } catch {
    /* private mode */
  }
}
