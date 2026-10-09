// The teacher page's only connection: the Apps Script API (docs/API.md). The invite key arrives after # in the
// link (never sent to a server or logged), is kept in THIS browser only and sent in the POST body.

export const API = __DOCENT_API__;
const KEY = `speesrep-docent-key-${__DOCENT_ENV__}`;

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Reads #key=… from the link once: stores it, then removes it from the address bar. */
export function takeKeyFromLink(): void {
  const m = location.hash.match(/key=([A-Za-z0-9]{32})/);
  if (!m) return;
  try {
    localStorage.setItem(KEY, m[1]);
  } catch {
    /* private mode: the key lives for this tab only */
    memoryKey = m[1];
  }
  history.replaceState(null, '', location.pathname);
}

let memoryKey = '';
export function getKey(): string {
  try {
    return localStorage.getItem(KEY) || memoryKey;
  } catch {
    return memoryKey;
  }
}

export function forgetKey(): void {
  memoryKey = '';
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

const RETRY = new Set(['no_action', 'busy', 'network', 'bad_response']);

/** POST {action, key, …} as text/plain (no CORS preflight). Retries what is safe to retry. */
export async function call<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  let last: ApiError = new ApiError('network', 'Geen verbinding.');
  for (let i = 0; i < 4; i++) {
    if (i) await new Promise((r) => setTimeout(r, 700 * i));
    let json: { ok?: boolean; error?: string; message?: string } & Record<string, unknown>;
    try {
      const res = await fetch(API, { method: 'POST', body: JSON.stringify({ ...body, action, key: getKey() }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
      try {
        json = await res.json();
      } catch {
        last = new ApiError('bad_response', `Onverwacht antwoord (HTTP ${res.status}).`);
        continue;
      }
    } catch {
      last = new ApiError('network', 'Geen verbinding.');
      continue;
    }
    if (json.ok) return json as T;
    last = new ApiError(json.error || 'server_error', json.message || 'Er ging iets mis.');
    if (!RETRY.has(last.code)) throw last;
  }
  throw last;
}

export type Group = { code: string; display_name: string; languages: string[] };
export type Translation = { text: string; example: string };
export type TCard = {
  id: string; type: string; nl: string; article: string; pos: string; example_nl: string; answer: string;
  tags: string[]; flags: string[]; added: string; translations: Record<string, Translation>; group_status?: string;
};
export type CurRow = { order: number; tag: string; rule: string; date: string; percentage: number | null; from_tags: string[] };
export type Topic = { tag: string; label: string; cards: number; bank: number };
export type Check = { errors: string[]; warnings: string[] };
