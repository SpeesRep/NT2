import { useEffect, useMemo, useState } from 'preact/hooks';
import { t } from '../i18n';
import { useStore, refreshFlagCount } from '../store';
import type { StudentFlag } from '../db';
import { exportText, flagCardLabel, groupFlags, listFlags, setCardResolved, type FlagGroup } from '../studentFlags';
import { showToast } from '../components/Toast';

/** "Gemarkeerd": the learner's own 🚩 flags. Local only; "Delen" is the only way they leave the phone. */
export function Marked({ onDone }: { onDone: () => void }) {
  const s = useStore();
  const [flags, setFlags] = useState<StudentFlag[]>([]);
  const load = async () => setFlags(await listFlags());
  useEffect(() => void load(), []);

  const cards = useMemo(() => new Map(s.cards.map((c) => [c.id, c])), [s.cards]);
  const groups = groupFlags(flags);
  const open = groups.filter((g) => !g.resolved);
  const resolved = groups.filter((g) => g.resolved);
  const text = exportText(flags, cards, t('mark.shareTitle'));
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const toggle = async (g: FlagGroup) => {
    await setCardResolved(g, !g.resolved);
    await load();
    await refreshFlagCount();
  };

  const share = async () => {
    try {
      await navigator.share({ title: t('mark.shareTitle'), text });
    } catch {
      /* she closed the share sheet */
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('mark.copied'));
    } catch {
      /* clipboard blocked */
    }
  };

  const row = (g: FlagGroup) => (
    <li key={g.card_id} class={`mark-item${g.resolved ? ' resolved' : ''}`}>
      <div class="mark-main">
        <span class="mark-card" lang="nl">
          {flagCardLabel(cards.get(g.card_id), g.card_id, g.label)}
          {g.flags.length > 1 && <span class="mark-times"> {g.flags.length}×</span>}
        </span>
        {g.notes.map((n) => (
          <span class="mark-note" key={n}>
            “{n}”
          </span>
        ))}
      </div>
      <button class={`mark-toggle${g.resolved ? ' on' : ''}`} aria-pressed={g.resolved} onClick={() => void toggle(g)}>
        {g.resolved ? '✓ ' : ''}
        {t('mark.resolve')}
      </button>
    </li>
  );

  return (
    <main class="topics">
      <h2 class="screen-title">{t('mark.title')}</h2>
      {flags.length === 0 && <p class="muted">{t('mark.empty')}</p>}
      {open.length > 0 && <ul class="mark-list">{open.map(row)}</ul>}
      {resolved.length > 0 && (
        <details class="mark-resolved">
          <summary>{t('mark.resolvedSection', { n: resolved.length })}</summary>
          <ul class="mark-list">{resolved.map(row)}</ul>
        </details>
      )}
      <div class="offer-actions topics-done">
        {open.length > 0 &&
          (canShare ? (
            <button class="btn btn-primary btn-huge" onClick={() => void share()}>
              {t('mark.share')}
            </button>
          ) : (
            <button class="btn btn-primary btn-huge" onClick={() => void copy()}>
              {t('mark.copy')}
            </button>
          ))}
        <button class="btn btn-secondary btn-huge" onClick={onDone}>
          {t('tags.done')}
        </button>
      </div>
    </main>
  );
}
