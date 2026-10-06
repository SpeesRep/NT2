import { apiGet, apiPost } from './api';
import { deleteEvents, mergeServerProgress, pendingCount, pendingEvents, saveSnapshot, setMeta } from './db';
import { progressKey, type Progress, type StateName, type Track } from './scheduler';
import { setUiSettings } from './prefs';
import { getState, loadFromDb, setState } from './store';
import { DEFAULT_SETTINGS, type Card, type CardsResponse, type CurriculumRow, type Settings } from './types';

const TYPES = new Set(['word', 'oneway', 'sentence', 'question']);

/** Defensive copy of a card from the API (the sheet is hand-edited). */
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

const PUSH_BATCH = 200;

/**
 * Sends queued reviews. Events leave the queue only after the server confirms them (accepted or
 * duplicate), so an interrupted push is simply repeated next time; the server ignores event_ids it has.
 */
export async function pushQueue(): Promise<number> {
  let sent = 0;
  for (;;) {
    const batch = (await pendingEvents()).slice(0, PUSH_BATCH);
    if (!batch.length) return sent;
    const res = await apiPost<{ accepted: string[]; duplicate: string[]; rejected: { event_id: string }[] }>('reviews', { events: batch });
    const done = [...res.accepted, ...res.duplicate, ...res.rejected.map((r) => r.event_id).filter(Boolean)];
    if (res.rejected.length) console.warn('rejected review events', res.rejected);
    await deleteEvents(done);
    sent += res.accepted.length;
    if (done.length < batch.length) return sent; // server left some unconfirmed: try again next sync
  }
}

export function cleanProgress(raw: Record<string, unknown>): Progress | null {
  const card_id = String(raw.card_id ?? '');
  const track = raw.track === 'prod' ? 'prod' : raw.track === 'recog' ? 'recog' : null;
  const due = String(raw.due ?? '');
  if (!card_id || !track || isNaN(Date.parse(due))) return null;
  const states: StateName[] = ['New', 'Learning', 'Review', 'Relearning'];
  const state = states.includes(raw.state as StateName) ? (raw.state as StateName) : 'Review';
  return {
    key: progressKey(card_id, track as Track),
    card_id,
    track: track as Track,
    state,
    due: new Date(due).toISOString(),
    stability: Number(raw.stability) || 0,
    difficulty: Number(raw.difficulty) || 0,
    reps: Number(raw.reps) || 0,
    lapses: Number(raw.lapses) || 0,
    last_review: raw.last_review ? new Date(String(raw.last_review)).toISOString() : '',
    learning_steps: Number(raw.learning_steps) || 0,
    scheduled_days: Number(raw.scheduled_days) || 0
  };
}

let running: Promise<boolean> | null = null;

/** Push reviews, then pull cards + settings + her Progress. Returns true on success. Never throws. */
export function syncNow(): Promise<boolean> {
  if (running) return running;
  running = (async () => {
    if (!navigator.onLine) return false;
    setState({ sync: 'syncing' });
    try {
      await pushQueue();
      const [res, state] = await Promise.all([
        apiGet<CardsResponse>('cards'),
        apiGet<{ progress: Record<string, unknown>[] }>('state')
      ]);
      const cards = res.cards.map(cleanCard).filter((c): c is Card & { order: number } => !!c && c.active);
      const settings = cleanSettings(res.settings);
      await saveSnapshot(cards, {
        settings,
        tags: (res.tags ?? []).filter((t) => t && t.tag),
        curriculum: cleanCurriculum(res.curriculum)
      });
      await mergeServerProgress(state.progress.map(cleanProgress).filter((p): p is Progress => !!p));
      await pushQueue(); // anything reviewed while we were pulling
      await setMeta('lastSync', new Date().toISOString());
      setUiSettings({ show_french_help: settings.show_french_help });
      await loadFromDb();
      setState({ sync: 'ok' });
      return true;
    } catch (e) {
      console.warn('sync failed', e);
      setState({ sync: 'error', pending: await pendingCount().catch(() => 0) });
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
