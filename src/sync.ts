import { getMeta, saveSnapshot, setMeta } from './db';
import { setUiSettings } from './prefs';
import { getState, loadFromDb, setState } from './store';
import { DEFAULT_SETTINGS, type Card, type ContentFile, type CurriculumRow, type GroupInfo, type Settings, type Tag, type Translation } from './types';
import { contentUrl } from './group';

const TYPES = new Set(['word', 'oneway', 'sentence', 'question']);

/** {lang: {text, example}} with sane keys and strings only. */
export function cleanTranslations(raw: unknown): Record<string, Translation> {
  const out: Record<string, Translation> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [lang, v] of Object.entries(raw as Record<string, Partial<Translation>>)) {
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(lang) || !v || typeof v !== 'object') continue;
    const text = String(v.text ?? '').trim();
    const example = String(v.example ?? '').trim();
    if (text || example) out[lang] = { text, example };
  }
  return out;
}

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
    example_nl: String(raw.example_nl ?? ''),
    translations: cleanTranslations(raw.translations),
    help: '',
    help_example: '',
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

export type Content = {
  version: string;
  group: GroupInfo;
  cards: (Card & { order: number })[];
  settings: Settings;
  tags: Tag[];
  curriculum: CurriculumRow[];
};

/** A topic from content.json: labels only as {lang: string}. */
function cleanTag(t: Partial<Tag>): Tag | null {
  if (!t || !t.tag) return null;
  const labels: Record<string, string> = {};
  if (t.labels && typeof t.labels === 'object') for (const [l, v] of Object.entries(t.labels)) if (v) labels[l] = String(v);
  return { tag: String(t.tag), label_nl: String(t.label_nl ?? t.tag), labels, ...(t.subject_nl ? { subject_nl: String(t.subject_nl) } : {}) };
}

/**
 * Validates a group's content.json (written by scripts/build-content.mjs). Throws on anything that is not this
 * group's word list. An inactive group ({active:false}) is not content: check `active` first (fetchGroup).
 */
export function parseContent(raw: unknown, code: string): Content {
  const r = raw as Partial<ContentFile> | null;
  if (!r || typeof r !== 'object' || r.code !== code || r.active !== true || typeof r.version !== 'string' || !r.version || !Array.isArray(r.cards)) {
    throw new Error('bad content.json');
  }
  return {
    version: r.version,
    group: { code, display_name: String(r.display_name ?? ''), languages: Array.isArray(r.languages) ? r.languages.map(String) : [] },
    cards: r.cards.map(cleanCard).filter((c): c is Card & { order: number } => !!c && c.active),
    settings: cleanSettings(r.settings),
    tags: (Array.isArray(r.tags) ? r.tags : []).map(cleanTag).filter((t): t is Tag => !!t),
    curriculum: cleanCurriculum(r.curriculum)
  };
}

export type GroupCheck =
  | { status: 'ok'; content: Content }
  | { status: 'stopped' }
  | { status: 'unknown' }
  | { status: 'offline' };

/** GETs the group's content.json from the app's own origin. 404 = unknown code; {active:false} = stopped. */
export async function fetchGroup(code: string): Promise<GroupCheck> {
  let res: Response;
  try {
    res = await fetch(contentUrl(code), { cache: 'no-cache' });
  } catch {
    return { status: 'offline' };
  }
  if (res.status === 404) return { status: 'unknown' };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as Partial<ContentFile>;
  if (raw && raw.code === code && raw.active === false) return { status: 'stopped' };
  return { status: 'ok', content: parseContent(raw, code) };
}

/** Stores a group's word list (only when its version changed). Progress is never touched. */
export async function saveContent(content: Content): Promise<void> {
  if (content.version !== (await getMeta('contentVersion'))) {
    await saveSnapshot(content.cards, { settings: content.settings, tags: content.tags, curriculum: content.curriculum });
    await setMeta('contentVersion', content.version);
  }
  await setMeta('group', content.group);
  await setMeta('groupStatus', 'ok');
  setUiSettings({ show_french_help: content.settings.show_french_help });
}

/**
 * Joins a group (code screen, join link, group page): stores the code and its list. A DIFFERENT group starts with
 * a clean curriculum latch and topic choice; progress stays (it belongs to the card, so shared cards keep it).
 */
export async function joinGroup(code: string, content: Content): Promise<void> {
  const before = await getMeta('groupCode');
  if (before && before !== code) {
    await setMeta('curriculumOpened', {});
    await setMeta('studyTags', []);
    await setMeta('contentVersion', '');
  }
  await setMeta('groupCode', code);
  await saveContent(content);
  await setMeta('lastSync', new Date().toISOString());
  await loadFromDb();
}

let running: Promise<boolean> | null = null;

/**
 * Checks the group's content.json on the app's own origin and stores it when its `version` is new. A stopped or
 * vanished group keeps its cards (and the student's progress) and only shows a message. Nothing is ever sent:
 * progress stays on this device. Returns true on success. Never throws.
 */
export function syncNow(): Promise<boolean> {
  if (running) return running;
  running = (async () => {
    const code = getState().groupCode;
    if (!navigator.onLine || !code) return false;
    setState({ sync: 'syncing' });
    try {
      const check = await fetchGroup(code);
      if (check.status === 'offline') throw new Error('offline');
      if (check.status === 'ok') await saveContent(check.content);
      else await setMeta('groupStatus', check.status);
      await setMeta('lastSync', new Date().toISOString());
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
