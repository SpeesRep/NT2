import type { Grade } from 'ts-fsrs';
import { RATINGS, t } from '../i18n';
import { formatInterval } from '../format';
import type { Outcome } from '../scheduler';

/**
 * Self-rating: ❌ Opnieuw · 😅 Moeilijk · ✅ Goed · 😎 Makkelijk — emoji, Dutch label, interval (smallest).
 * All cards are self-rated; there is no typed answer.
 */
export function RatingBar({ outcomes, onRate, disabled }: { outcomes: Record<Grade, Outcome>; onRate: (g: Grade) => void; disabled?: boolean }) {
  return (
    <div class="rating-bar">
      {RATINGS.map((r) => {
        const g = r.rating as Grade;
        const interval = formatInterval(outcomes[g].intervalMs);
        return (
          <button
            key={r.key}
            class={`rating rating-${r.key}`}
            disabled={disabled}
            aria-label={t('rating.aria', { label: r.nl, interval })}
            onClick={() => onRate(g)}
          >
            <span class="rating-emoji" aria-hidden="true">
              {r.emoji}
            </span>
            <span class="rating-label">{r.nl}</span>
            <span class="rating-interval">{interval}</span>
          </button>
        );
      })}
    </div>
  );
}
