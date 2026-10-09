import { useEffect, useMemo, useState } from 'preact/hooks';
import { APP_ENV, BUILD_ID } from './config';
import { useOnline } from './pwa';
import { t } from './i18n';
import { getState, loadFromDb, setState, useStore } from './store';
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
import { JoinScreen } from './screens/JoinScreen';
import { LanguageScreen } from './screens/LanguageScreen';
import { GroupBanner } from './components/Banners';
import { codeFromUrl } from './group';
import { fetchGroup, joinGroup } from './sync';
import type { UIKey } from './i18n';

type Screen = { name: 'home' } | { name: 'topics' } | { name: 'marked' } | { name: 'progress' } | { name: 'settings' } | { name: 'about' } | { name: 'join' } | { name: 'review'; items: Item[] };

/**
 * A join link (…/?groep=<code>) or a group page (…/g/<code>/): join that group, then clean the address bar.
 * Returns a message for the code screen when the code does not work (offline: kept, checked at the next update).
 */
async function joinFromLink(): Promise<{ code: string; message: UIKey } | null> {
  const base = import.meta.env.BASE_URL;
  const code = codeFromUrl(location.href, base);
  if (!code) return null;
  // A join link: clean the address bar. A group page (/g/<code>/) stays as it is: its manifest carries the code
  // for "Zet op beginscherm".
  if (!location.pathname.includes('/g/')) history.replaceState(null, '', base);
  if (code === getState().groupCode) return null;
  const res = await fetchGroup(code).catch(() => ({ status: 'unknown' as const }));
  if (res.status === 'ok') {
    await joinGroup(code, res.content);
    return null;
  }
  if (res.status === 'offline') {
    await setMeta('groupCode', code);
    await loadFromDb();
    return null;
  }
  return { code, message: res.status === 'stopped' ? 'join.stopped' : 'join.unknown' };
}

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

  // Load what's on the phone first (works offline), join a group from a link, then check for a new word list.
  const [linkProblem, setLinkProblem] = useState<{ code: string; message: UIKey } | null>(null);
  useEffect(() => {
    setDbBlockedHandler(() => showToast(t('db.blocked'), { ms: 15000 }));
    loadFromDb()
      .then(joinFromLink)
      .then((problem) => {
        setLinkProblem(problem);
        if (navigator.onLine) void syncNow();
      });
  }, []);
  useEffect(() => {
    if (!online || !s.loaded) return;
    if (screen.name === 'home') void syncNow(); // during review: wait, the new word list can come later
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

  // No group yet (there is no default group), a link with a bad code, or "another group" from the menu.
  if (s.loaded && (!s.groupCode || linkProblem || screen.name === 'join')) {
    const leave = s.groupCode ? () => { setLinkProblem(null); setScreen({ name: 'home' }); } : undefined;
    return (
      <div class="app">
        <UpdateBanner />
        <Toast />
        <header class="topbar">
          <div />
          <div class="topbar-right">
            {!online && <span class="offline-badge">{t('status.offline')}</span>}
            <HelpButton screen="join" />
          </div>
        </header>
        <JoinScreen
          key={linkProblem?.code ?? 'join'}
          initial={linkProblem?.code ?? ''}
          message={linkProblem?.message ?? null}
          onCancel={leave}
          onJoined={() => {
            setLinkProblem(null);
            setScreen({ name: 'home' });
          }}
        />
      </div>
    );
  }
  // Joined, but the help language is not chosen yet (only asked when the group offers languages).
  if (s.loaded && s.helpLang === null && s.group && s.group.languages.length) {
    return (
      <div class="app">
        <Toast />
        <LanguageScreen languages={s.group.languages} />
      </div>
    );
  }

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
      <GroupBanner />
      <header class="topbar">
        <Menu go={(name) => setScreen({ name } as Screen)} />
        <div class="topbar-right">
          {!online && <span class="offline-badge">{t('status.offline')}</span>}
          <HelpButton screen={screen.name === 'home' || screen.name === 'join' ? 'home' : screen.name} />
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
