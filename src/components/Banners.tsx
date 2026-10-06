import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { isIosBrowser, isStandalone, useNeedRefresh } from '../pwa';
import { NS } from '../config';
import { t } from '../i18n';

export function UpdateBanner() {
  const [need, reload] = useNeedRefresh();
  if (!need) return null;
  return (
    <div class="banner banner-update" role="status">
      <span>{t('update.available')}</span>
      <button class="btn btn-small" onClick={reload}>
        {t('update.open')}
      </button>
    </div>
  );
}

const HINT_KEY = `${NS}:install-hint-dismissed`;

/** Replaces {name} placeholders in a translated string with elements. */
function withIcons(text: string, icons: Record<string, JSX.Element>) {
  return text.split(/(\{\w+\})/).map((part) => {
    const m = part.match(/^\{(\w+)\}$/);
    return m && icons[m[1]] ? icons[m[1]] : part;
  });
}

export function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || isStandalone() || !isIosBrowser()) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* private mode */
    }
    setHidden(true);
  };
  return (
    <div class="banner banner-install" role="note">
      <p>{withIcons(t('install.hint'), { share: <ShareIcon />, add: <AddIcon /> })}</p>
      <button class="btn-link" onClick={dismiss} aria-label={t('install.close')}>
        ✕
      </button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg class="inline-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg class="inline-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}
