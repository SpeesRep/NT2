import { useMemo } from 'preact/hooks';
import { t } from '../i18n';
import { setMeta } from '../db';
import { setState, useStore } from '../store';
import { useSettings } from '../settings';
import { curriculumStatus, topicChoices } from '../curriculum';
import { localDate } from '../session';

/** "Kies een onderwerp": choose one or more tags; the next sessions use only cards with any of them. */
export function Topics({ onDone }: { onDone: () => void }) {
  const s = useStore();
  const settings = useSettings();
  const selected = new Set(s.studyTags);

  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of s.cards) for (const tag of c.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    const cur = curriculumStatus(s.curriculum, s.cards, s.progress, settings, localDate(), s.curriculumOpened, s.tags.map((tg) => tg.tag));
    const label = new Map(s.tags.map((tg) => [tg.tag, tg.label_nl || tg.tag]));
    // Only topics with a Curriculum row that is not dicht (and that have cards); 🔒 = not open yet.
    return topicChoices(cur)
      .filter((c) => counts.has(c.tag))
      .map((c) => ({ tag: c.tag, label: label.get(c.tag) ?? c.tag, count: counts.get(c.tag)!, locked: c.locked }))
      .sort((a, b) => a.label.localeCompare(b.label, 'nl', { sensitivity: 'base' })); // alphabetical
  }, [s.cards, s.tags, s.curriculum, s.curriculumOpened, s.progress, settings.known_stability_days, settings.known_min_reviews]);

  const save = async (next: string[]) => {
    setState({ studyTags: next });
    await setMeta('studyTags', next);
  };
  const toggle = (tag: string) => {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    void save([...next]);
  };

  return (
    <main class="topics">
      <h2 class="screen-title">{t('tags.title')}</h2>
      <button class={`chip chip-all${selected.size === 0 ? ' on' : ''}`} aria-pressed={selected.size === 0} onClick={() => void save([])}>
        {t('tags.all')}
      </button>
      <div class="chips">
        {rows.map((r) => (
          <button key={r.tag} class={`chip${selected.has(r.tag) ? ' on' : ''}`} aria-pressed={selected.has(r.tag)} onClick={() => toggle(r.tag)}>
            <span class="chip-label">{r.label}</span>
            <span class="chip-count">
              {r.locked ? `🔒 ${t('tags.locked')}` : t('home.cards', { n: r.count })}
            </span>
          </button>
        ))}
      </div>
      <button class="btn btn-primary btn-huge topics-done" onClick={onDone}>
        {t('tags.done')}
      </button>
    </main>
  );
}
