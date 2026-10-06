import { useState } from 'preact/hooks';
import { NS } from '../config';
import { RATINGS, t } from '../i18n';
import { useSettings } from '../settings';

const SEEN_KEY = `${NS}:rating-help-seen`;

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * One-time overlay (first review session) explaining the four buttons in French, plus a small "?"
 * that reopens it. This is the only place the button labels are translated. Hidden when
 * Settings.show_french_help is FALSE.
 */
export function RatingHelp() {
  const show = useSettings().show_french_help;
  const [open, setOpen] = useState(() => !seen());
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode */
    }
    setOpen(false);
  };
  return (
    <>
      <button class="rating-help-btn" onClick={() => setOpen(true)} aria-label={t('rating.helpReopen')}>
        ?
      </button>
      {open && (
        <div class="sheet-backdrop" onClick={close}>
          <div class="sheet" role="dialog" aria-modal="true" aria-label={t('rating.helpTitle')} onClick={(e) => e.stopPropagation()}>
            <h2>{t('rating.helpTitle')}</h2>
            <ul class="rating-help-list">
              {RATINGS.map((r) => (
                <li key={r.key}>
                  <span class="rating-emoji" aria-hidden="true">
                    {r.emoji}
                  </span>
                  <strong lang="nl">{r.nl}</strong>
                  <span lang="fr">= {r.fr}</span>
                </li>
              ))}
            </ul>
            <button class="btn btn-primary btn-block" onClick={close}>
              {t('rating.helpOk')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
