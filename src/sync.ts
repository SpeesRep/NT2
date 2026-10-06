import { getMeta, saveSnapshot, setMeta } from './db';
import { setUiSettings } from './prefs';
import { getState, loadFromDb, setState } from './store';
import { DEFAULT_SETTINGS, type Card, type CardsResponse, type CurriculumRow, type Settings } from './types';

const TYPES = new Set(['word', 'oneway', 'sentence', 'question']);

/** Defensive copy of a card from content.json (the sheet is hand-edited). */
export function cleanCard(raw: Partial<Card>, order: number): (Card & { order: number }) | null {
  if (!raw || !raw.id || !raw.nl) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : []);
  return {
    id: String(raw.id),
    type: (TYPES.has(String(raw.type)) ? raw.type : 'word') as Card['type'],
    nl: String(raw.nl).trim(),
    article: raw.article === 'de' || raw.article === 'het' ? raw.article : '',
    pos: String(raw.pos ?? ''),
    fr: String(raw.fr ?? '').trim(),
    example_nl: String(raw.example_nl ?? ''),
    example_fr: String(raw.example_fr ?? ''),
    tags: list(raw.tags).map((t) => t.toLowerCase()),
    flags: list(raw.flags).map((f) => f.toLowerCase()),
    answer: String(raw.answer ?? '').trim(),
    added: String(raw.added ?? ''),
    active: raw.active !== false,
    order
  };
}

export function cleanSettings(raw: Partial<Settings> | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  const num = (v: unknown, d: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  return {
    new_per_day: Math.round(num(s.new_per_day, 10, 0, 100)),
    desired_retention: num(s.desired_retention, 0.9, 0.7, 0.97),
    unlock_prod_stability_days: num(s.unlock_prod_stability_days, 3, 0, 365),
    known_stability_days: num(s.known_stability_days, 7, 0, 3650),
    known_min_reviews: Math.round(num(s.known_min_reviews, 2, 0, 1000)),
    show_french_help: s.show_french_help !== false,
    max_learning_backlog: Math.round(num(s.max_learning_backlog, 3, 1, 100)),
    due_window_minutes: num(s.due_window_minutes, 5, 0, 24 * 60),
    max_reviews_per_day: Math.round(num(s.max_reviews_per_day, 100, 1, 10_000)),
    listen_share: num(s.listen_share, 0.3, 0, 1)
  };
}

export function cleanCurriculum(raw: unknown): CurriculumRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: Record<string, unknown>) => {
      const order = Number(r.order);
      const pct = r.percentage === '' || r.percentage === null || r.percentage === undefined ? null : Number(r.percentage);
      return {
        order: r.order === '' || r.order === null || r.order === undefined || isNaN(order) ? 0 : order,
        tag: String(r.tag ?? '').trim().toLowerCase(),
        rule: String(r.rule ?? '').trim(),
        date: String(r.date ?? '').trim(),
        percentage: pct === null || isNaN(pct) ? null : pct,
        from_tags: Array.isArray(r.from_tags) ? r.from_tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : []
      };
    })
    .filter((r) => r.tag || r.rule);
}

/** The word list, published by the content Action next to the app (same origin, never an external host). */
export const CONTENT_URL = `${import.meta.env.BASE_URL}content.json`;

export type Content = {
  version: string;
  cards: (Card & { order: number })[];
  settings: Settings;
  tags: CardsResponse['tags'];
  curriculum: CurriculumRow[];
};

/** Validates content.json (written by scripts/build-content.mjs). Throws on anything that is not a word list. */
export function parseContent(raw: unknown): Content {
  const r = raw as Partial<CardsResponse> & { version?: unknown };
  if (!r || typeof r !== 'object' || typeof r.version !== 'string' || !r.version || !Array.isArray(r.cards)) {
    throw new Error('bad content.json');
  }
  return {
    version: r.version,
    cards: r.cards.map(cleanCard).filter((c): c is Card & { order: number } => !!c && c.active),
    settings: cleanSettings(r.settings),
    tags: (Array.isArray(r.tags) ? r.tags : []).filter((t) => t && t.tag),
    curriculum: cleanCurriculum(r.curriculum)
  };
}

let running: Promise<boolean> | null = null;

/**
 * Fetches content.json from the app's own origin and stores it when its `version` is new. Nothing is ever
 * sent: progress stays on this device. Returns true on success. Never throws.
 */
export function syncNow(): Promise<boolean> {
  if (running) return running;
  running = (async () => {
    if (!navigator.onLine) return false;
    setState({ sync: 'syncing' });
    try {
      const res = await fetch(CONTENT_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = parseContent(await res.json());
      if (content.version !== (await getMeta('contentVersion'))) {
        await saveSnapshot(content.cards, { settings: content.settings, tags: content.tags, curriculum: content.curriculum });
        await setMeta('contentVersion', content.version);
      }
      await setMeta('lastSync', new Date().toISOString());
      setUiSettings({ show_french_help: content.settings.show_french_help });
      await loadFromDb();
      setState({ sync: 'ok' });
      return true;
    } catch (e) {
      console.warn('content update failed', e);
      setState({ sync: 'error' });
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

export function isSyncing(): boolean {
  return getState().sync === 'syncing';
}
