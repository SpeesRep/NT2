import { useMemo } from 'preact/hooks';
import { t } from '../i18n';
import { useStore } from '../store';
import { useSettings } from '../settings';
import { overview } from '../stats';

/** "Voortgang": what she has learned, this week's reviews, streak, what is coming. */
export function ProgressScreen({ onDone }: { onDone: () => void }) {
  const s = useStore();
  const settings = useSettings();
  const o = useMemo(
    () => overview(s.cards, s.progress, s.dayCounts, settings, new Date()),
    [s.cards, s.progress, s.dayCounts, settings.known_stability_days, settings.known_min_reviews]
  );
  const tile = (value: number | string, label: string) => (
    <div class="stat">
      <span class="stat-value">{value}</span>
      <span class="stat-label">{label}</span>
    </div>
  );
  return (
    <main class="topics">
      <h2 class="screen-title">{t('progress.title')}</h2>
      <section class="stats">
        {tile(o.learned, t('progress.learned', { n: o.total }))}
        {tile(o.known, t('progress.known'))}
        {tile(o.week, t('progress.week'))}
        {tile(o.streak, t('progress.streak'))}
      </section>
      <section class="stats stats-3">
        {tile(o.dueToday, t('progress.dueToday'))}
        {tile(o.dueTomorrow, t('progress.dueTomorrow'))}
        {tile(o.due7, t('progress.due7'))}
      </section>
      <button class="btn btn-primary btn-huge topics-done" onClick={onDone}>
        {t('tags.done')}
      </button>
    </main>
  );
}
