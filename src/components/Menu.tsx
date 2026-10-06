import { useState } from 'preact/hooks';
import { APP_ENV, APP_NAME } from '../config';
import { t } from '../i18n';
import { useStore } from '../store';
import { SyncBox } from './SyncBox';

/** Tap the app name ("SpeesRep") → menu: Voortgang, Gemarkeerd, Instellingen, Over SpeesRep, then the sync status. A red dot on the title when cards are marked or answers are not sent yet. */
export function Menu({ go }: { go: (screen: 'progress' | 'marked' | 'settings' | 'about') => void }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const pick = (screen: 'progress' | 'marked' | 'settings' | 'about') => {
    setOpen(false);
    go(screen);
  };
  return (
    <>
      <button class="title-btn" onClick={() => setOpen(true)} aria-haspopup="menu" aria-label={t('menu.open')}>
        <h1>
          {APP_NAME} {APP_ENV === 'DEV' && <span class="env-badge">DEV</span>}
          <span class="menu-caret" aria-hidden="true">
            ▾
          </span>
          {(s.flagsOpen > 0 || s.pending > 0) && <span class="menu-dot" aria-hidden="true" />}
        </h1>
      </button>
      {open && (
        <div class="sheet-backdrop" onClick={() => setOpen(false)}>
          <nav class="sheet menu-sheet" role="menu" aria-label={t('menu.title')} onClick={(e) => e.stopPropagation()}>
            <button class="menu-item" role="menuitem" onClick={() => pick('progress')}>
              <span aria-hidden="true">📈</span> {t('progress.title')}
            </button>
            <button class="menu-item" role="menuitem" onClick={() => pick('marked')}>
              <span aria-hidden="true">🚩</span> {t('mark.title')}
              {s.flagsOpen > 0 && <span class="menu-count">{s.flagsOpen}</span>}
            </button>
            <button class="menu-item" role="menuitem" onClick={() => pick('settings')}>
              <span aria-hidden="true">⚙️</span> {t('settings.title')}
            </button>
            <button class="menu-item" role="menuitem" onClick={() => pick('about')}>
              <span aria-hidden="true">ℹ️</span> {t('about.title')}
            </button>
            <SyncBox />
            <button class="btn btn-secondary btn-block" onClick={() => setOpen(false)}>
              {t('help.close')}
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
