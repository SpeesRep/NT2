import { useEffect, useMemo, useState } from 'preact/hooks';
import { APP_ENV, BUILD_ID } from './config';
import { useOnline } from './pwa';
import { t } from './i18n';
import { getState, loadFromDb, setState, useStore } from './store';
import { schedulePush } from './review';
import { syncNow } from './sync';
import { UpdateBanner } from './components/Banners';
import { HelpButton } from './components/Help';
import { Home } from './screens/Home';
import { Review } from './screens/Review';
import { interleave, localDate, planToday, todaysIntro, type Item } from './session';
import { dueDoneCount, laterToday, nextRound, todayBar, todaysDone, todaysRound } from './today';
import { curriculumStatus, latchChanged, makePicker } from './curriculum';
import { Topics } from './screens/Topics';
import { Marked } from './screens/Marked';
import { ProgressScreen } from './screens/ProgressScreen';
import { Toast, showToast } from './components/Toast';
import { setDbBlockedHandler, setMeta } from './db';
import { Menu } from './components/Menu';
import type { Card } from './types';
import { listenMode, voicesReady } from './tts';
import { useSettings } from './settings';
import { SettingsScreen } from './screens/SettingsScreen';
import { AboutScreen } from './screens/AboutScreen';

type Screen = { name: 'home' } | { name: 'topics' } | { name: 'marked' } | { name: 'progress' } | { name: 'settings' } | { name: 'about' } | { name: 'review'; items: Item[] };

export function App() {
  const online = useOnline();
  const s = useStore();
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const settings = useSettings();
  useEffect(() => {
    voicesReady().then((v) => setState({ hasVoice: !!v }));
  }, []);
  /** Today's run; with listening on, some word-recognition reviews become listening cards. */
  const todayItems = () =>
    interleave(plan).map((i) => ({ ...i, listen: listenMode(i.card, i.track, i.progress?.reps ?? 0, settings) }));

  // Load what's on the phone first (works offline), then refresh from the sheet when online.
  useEffect(() => {
    setDbBlockedHandler(() => showToast(t('db.blocked'), { ms: 15000 }));
    loadFromDb().then(() => navigator.onLine && syncNow());
  }, []);
  useEffect(() => {
    if (!online || !s.loaded) return;
    if (screen.name === 'home') void syncNow();
    else schedulePush(0); // during review: just send the queued reviews
  }, [online]);
  // Coming back to the app (it stays alive in the background on iOS): recompute today's work (no timers),
  // and refresh from the sheet if the last sync is old.
  const [focus, setFocus] = useState(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setFocus((n) => n + 1);
      if (!navigator.onLine) return;
      const last = getState().lastSync;
      if (!last || Date.now() - Date.parse(last) > 2 * 60_000) void syncNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Recomputed when cards/progress change, when the screen changes and when the app regains focus.
  const plan = useMemo(() => {
    const now = new Date();
    const done = todaysDone(s.doneToday, now);
    const cur = curriculumStatus(s.curriculum, s.cards, s.progress, settings, localDate(now), s.curriculumOpened, s.tags.map((tg) => tg.tag));
    const picker = makePicker(cur.open);
    const topics = new Set(s.studyTags);
    const eligible = topics.size ? (c: Card) => c.tags.some((tg) => topics.has(tg)) : undefined;
    const p = planToday(s.cards, s.progress, settings, todaysIntro(s.intro, now), now, {
      pickNew: picker.pickNew,
      eligible,
      dueDone: dueDoneCount(done)
    });
    const keys = [...p.due, ...p.fresh].map((i) => `${i.card.id}|${i.track}`);
    // The bar covers the current round: a finished round + new cards → a new round at 0; cards arriving while a
    // round is going join it.
    const round = nextRound(todaysRound(s.round, now), keys.length);
    return { ...p, opened: cur.opened, round, bar: todayBar(round, keys), later: laterToday(s.cards, s.progress, settings, now, eligible) };
  }, [
    s.cards, s.progress, s.intro, s.curriculum, s.studyTags, s.doneToday, s.round, focus, screen.name,
    settings.new_per_day, settings.due_window_minutes, settings.max_reviews_per_day, settings.unlock_prod_stability_days,
    s.curriculumOpened, s.tags, settings.known_stability_days, settings.known_min_reviews
  ]);

  // The curriculum latch: a topic that opened stays open (a dicht row clears it). Stored on the phone.
  useEffect(() => {
    if (latchChanged(plan.opened, s.curriculumOpened)) {
      setState({ curriculumOpened: plan.opened });
      void setMeta('curriculumOpened', plan.opened);
    }
  }, [plan.opened]);

  // Keep the round on the phone when it finished or a new one started (survives closing the app).
  useEffect(() => {
    if (plan.round !== s.round) {
      setState({ round: plan.round });
      void setMeta('round', plan.round);
    }
  }, [plan.round]);

  // One wake-up (not a countdown) when the next later-today card joins the round, so Starten comes back while
  // she stays on home. The line itself stays static.
  useEffect(() => {
    if (screen.name !== 'home' || plan.later.nextAt === null) return;
    const id = setTimeout(() => setFocus((n) => n + 1), Math.max(0, plan.later.nextAt - Date.now()) + 1000);
    return () => clearTimeout(id);
  }, [plan.later.nextAt, screen.name]);

  if (screen.name === 'review') {
    return (
      <div class="app">
        <UpdateBanner />
        <Toast />
        <Review items={screen.items} onExit={() => setScreen({ name: 'home' })} />
      </div>
    );
  }

  return (
    <div class="app">
      <UpdateBanner />
      <Toast />
      <header class="topbar">
        <Menu go={(name) => setScreen({ name } as Screen)} />
        <div class="topbar-right">
          {!online && <span class="offline-badge">{t('status.offline')}</span>}
          <HelpButton screen={screen.name === 'home' ? 'home' : screen.name} />
        </div>
      </header>
      {screen.name === 'topics' ? (
        <Topics onDone={() => setScreen({ name: 'home' })} />
      ) : screen.name === 'marked' ? (
        <Marked onDone={() => setScreen({ name: 'home' })} />
      ) : screen.name === 'progress' ? (
        <ProgressScreen onDone={() => setScreen({ name: 'home' })} />
      ) : screen.name === 'settings' ? (
        <SettingsScreen onDone={() => setScreen({ name: 'home' })} />
      ) : screen.name === 'about' ? (
        <AboutScreen onDone={() => setScreen({ name: 'home' })} />
      ) : (
      <Home
        onTopics={() => setScreen({ name: 'topics' })}
        due={plan.due.length}
        newToday={plan.fresh.length}
        bar={plan.bar}
        later={plan.later.groups}
        onStart={() => setScreen({ name: 'review', items: todayItems() })}
      />
      )}
      <footer class="footer muted">
        {APP_ENV} · {BUILD_ID}
      </footer>
    </div>
  );
}
