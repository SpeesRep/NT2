import type { Card } from './types';
import type { Progress } from './scheduler';
import { localDate } from './session';
import { isKnown, primaryTrack, type KnownRule } from './curriculum';
import { progressKey } from './scheduler';

export type Overview = {
  learned: number; // cards she has started (any track reviewed)
  known: number; // cards whose main direction is "bekend" (known_stability_days + known_min_reviews)
  total: number; // active cards
  week: number; // reviews in the last 7 days (incl. today)
  streak: number; // days in a row with ≥ 1 review, ending today (or yesterday if nothing yet today)
  last7: { date: string; n: number }[]; // oldest → today
  dueToday: number;
  dueTomorrow: number;
  due7: number; // due within the next 7 days (incl. today)
};

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Pure numbers for the "Voortgang" screen. */
export function overview(
  cards: Card[],
  progress: Map<string, Progress>,
  dayCounts: Record<string, number>,
  known: KnownRule,
  now: Date
): Overview {
  const ids = new Set(cards.map((c) => c.id));
  const rows = [...progress.values()].filter((p) => ids.has(p.card_id) && !(p.state === 'New' && !p.reps));
  const learned = new Set(rows.map((p) => p.card_id)).size;
  const knownCount = cards.filter((c) => isKnown(progress.get(progressKey(c.id, primaryTrack(c))), known)).length;

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const date = localDate(addDays(now, i - 6));
    return { date, n: dayCounts[date] ?? 0 };
  });
  let streak = 0;
  for (let i = dayCounts[localDate(now)] ? 0 : 1; ; i++) {
    if (!dayCounts[localDate(addDays(now, -i))]) break;
    streak++;
  }
  const endOf = (days: number) => {
    const d = addDays(now, days);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  };
  const dueBy = (t: number) => rows.filter((p) => Date.parse(p.due) <= t).length;
  return {
    learned, known: knownCount, total: cards.length,
    week: last7.reduce((s, d) => s + d.n, 0), streak, last7,
    dueToday: dueBy(endOf(0)), dueTomorrow: dueBy(endOf(1)) - dueBy(endOf(0)), due7: dueBy(endOf(6))
  };
}
