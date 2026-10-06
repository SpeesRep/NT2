import { t } from '../i18n';
import { useStore } from '../store';
import { useOnline } from '../pwa';
import { InstallHint } from '../components/Banners';
import { useInstallPrompt } from '../installPrompt';
import { isStandalone } from '../pwa';
import type { LaterGroup } from '../today';

type Props = {
  due: number;
  newToday: number;
  bar: { done: number; remaining: number; fill: number }; // "Vandaag" (unique items)
  later: LaterGroup[]; // cards due later today (outside the due window); static, recomputed on open / focus
  onStart: () => void;
  onTopics: () => void;
};

export function Home({ due, newToday, bar, later, onStart, onTopics }: Props) {
  const s = useStore();
  const online = useOnline();
  const empty = s.loaded && s.cards.length === 0;
  const canStart = due + newToday > 0;
  const install = useInstallPrompt(isStandalone());

  return (
    <main class="home">
      <InstallHint />
      {install.show && (
        <button class="btn btn-secondary install-btn" onClick={() => void install.install()}>
          ⬇ {t('install.android')}
        </button>
      )}

      {empty ? (
        <p class="empty">{online ? t('home.empty') : t('home.emptyOffline')}</p>
      ) : (
        <>
          <section class="stats">
            <div class="stat">
              <span class="stat-value">{s.loaded ? due : '—'}</span>
              <span class="stat-label">{t('home.due')}</span>
            </div>
            <div class="stat">
              <span class="stat-value">{s.loaded ? newToday : '—'}</span>
              <span class="stat-label">{t('home.newToday')}</span>
            </div>
          </section>
          {s.loaded && bar.done + bar.remaining > 0 && (
            <section class="today" aria-label={t('today.label')}>
              <div class="today-head">
                <span class="today-label">{t('today.label')}</span>
                {bar.remaining > 0 && <span class="today-left">{t(bar.remaining === 1 ? 'today.left1' : 'today.left', { n: bar.remaining })}</span>}
              </div>
              <div class="today-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar.fill * 100)}>
                <div class="today-fill" style={{ width: `${Math.round(bar.fill * 100)}%` }} />
              </div>
            </section>
          )}
          <button class="btn btn-secondary topic-btn" onClick={onTopics}>
            {s.studyTags.length === 0
              ? t('home.topicAll')
              : t('home.topic', {
                  list: s.studyTags.map((tg) => s.tags.find((x) => x.tag === tg)?.label_nl || tg).join(', ')
                })}
          </button>
          {!s.loaded || canStart ? (
            <button class="btn btn-primary btn-huge" disabled={!canStart} onClick={onStart}>
              {t('home.start')}
            </button>
          ) : (
            <div class="all-done">
              <p class="done-big">{t('home.allDone')}</p>
            </div>
          )}
          {s.loaded && later.length > 0 && (
            <p class="center muted later-line">
              {t('home.later', {
                list: later.map((g) => (g.hour !== undefined ? t('home.laterHour', { n: g.n, h: g.hour }) : t('home.laterMin', { n: g.n, m: g.min! }))).join(' · ')
              })}
            </p>
          )}
        </>
      )}

    </main>
  );
}
