import type { Settings } from './types';
import type { Progress } from './scheduler';
import { pickNextIndex, type Item } from './session';
import { inDueWindow } from './today';

/**
 * The queue after rating `queue[0]` (pure; used by the review screen and the tests):
 *  - the card goes back into this run ONLY if its next step is inside the due window (strictly less than
 *    due_window_minutes — the same rule as the round itself, `inDueWindow`), marked `learning`, 3 places later;
 *    "Goed" (10 min) and "Makkelijk" leave the run and come back via the later-today line;
 *  - the next card: `pickNextIndex` (not before its due time while others are ready; backlog rule for new cards).
 */
export function afterRating(
  queue: Item[],
  next: Progress,
  rules: Pick<Settings, 'max_learning_backlog' | 'due_window_minutes'>,
  now = Date.now()
): Item[] {
  const item = queue[0];
  const rest = queue.slice(1);
  if (inDueWindow(next.due, now, rules)) {
    rest.splice(Math.min(3, rest.length), 0, { ...item, isNew: false, learning: true, progress: next });
  }
  const k = pickNextIndex(rest, rules.max_learning_backlog, now);
  if (k > 0) rest.unshift(...rest.splice(k, 1));
  return rest;
}
