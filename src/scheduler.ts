import { createEmptyCard, fsrs, generatorParameters, State, type Card as FsrsCard, type Grade, type FSRS } from 'ts-fsrs';
import type { Card, Settings } from './types';

export type Track = 'recog' | 'prod';
export type StateName = 'New' | 'Learning' | 'Review' | 'Relearning';

/** Scheduling state of one (card, track). Stored in IndexedDB `progress` and mirrored in the Progress tab. */
export type Progress = {
  key: string; // `${card_id}|${track}`
  card_id: string;
  track: Track;
  state: StateName;
  due: string; // ISO
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  last_review: string; // ISO or ''
  learning_steps: number;
  scheduled_days: number;
};

/** What the server keeps per review (Log.snapshot) — enough to restore Progress exactly. */
export type Snapshot = Pick<Progress, 'state' | 'due' | 'stability' | 'difficulty' | 'reps' | 'lapses' | 'learning_steps' | 'scheduled_days'>;

export const progressKey = (card_id: string, track: Track) => `${card_id}|${track}`;

export function makeScheduler(settings: Pick<Settings, 'desired_retention'>): FSRS {
  return fsrs(generatorParameters({ request_retention: settings.desired_retention, enable_fuzz: true }));
}

export function toFsrsCard(p: Progress | undefined, now: Date): FsrsCard {
  if (!p) return createEmptyCard(now);
  return {
    due: new Date(p.due),
    stability: p.stability,
    difficulty: p.difficulty,
    elapsed_days: 0,
    scheduled_days: p.scheduled_days || 0,
    learning_steps: p.learning_steps || 0,
    reps: p.reps,
    lapses: p.lapses,
    state: State[p.state] ?? State.New,
    last_review: p.last_review ? new Date(p.last_review) : undefined
  };
}

export function fromFsrsCard(card_id: string, track: Track, c: FsrsCard): Progress {
  return {
    key: progressKey(card_id, track),
    card_id,
    track,
    state: State[c.state] as StateName,
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    lapses: c.lapses,
    last_review: c.last_review ? c.last_review.toISOString() : '',
    learning_steps: c.learning_steps,
    scheduled_days: c.scheduled_days
  };
}

export function snapshotOf(p: Progress): Snapshot {
  const { state, due, stability, difficulty, reps, lapses, learning_steps, scheduled_days } = p;
  return { state, due, stability, difficulty, reps, lapses, learning_steps, scheduled_days };
}

export type Outcome = { rating: Grade; next: Progress; intervalMs: number };

/**
 * All four outcomes, computed ONCE when the answer is shown. The button labels and the applied result
 * come from the same computation, so with fuzz on the shown interval is exactly what gets scheduled.
 */
export function previewOutcomes(sched: FSRS, card_id: string, track: Track, prev: Progress | undefined, now: Date): Record<Grade, Outcome> {
  const preview = sched.repeat(toFsrsCard(prev, now), now);
  const out = {} as Record<Grade, Outcome>;
  for (const rating of [1, 2, 3, 4] as Grade[]) {
    const next = fromFsrsCard(card_id, track, preview[rating].card);
    out[rating] = { rating, next, intervalMs: new Date(next.due).getTime() - now.getTime() };
  }
  return out;
}

/** Tracks a card has: word → recog (+ prod once unlocked); sentence/question → prod only. */
export function tracksFor(card: Card, recog: Progress | undefined, settings: Pick<Settings, 'unlock_prod_stability_days'>): Track[] {
  if (card.type !== 'word') return ['prod'];
  const prodUnlocked = !!recog && recog.state !== 'New' && recog.stability >= settings.unlock_prod_stability_days;
  return prodUnlocked ? ['recog', 'prod'] : ['recog'];
}
