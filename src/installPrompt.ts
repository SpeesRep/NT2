import { useEffect, useState } from 'preact/hooks';
import { NS } from './config';

// Android Chrome: keep the `beforeinstallprompt` event (and suppress Chrome's own mini-banner) so the app can
// offer "App installeren" itself — only after she completed a first session, never on first load.
// iOS has no such event; it keeps the Share → "Zet op beginscherm" hint (InstallHint).

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const ENGAGED_KEY = `${NS}:engaged`;
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // no automatic banner
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

/** Called when a session ends that counted: from then on the install button may appear. */
export function markEngaged() {
  try {
    localStorage.setItem(ENGAGED_KEY, '1');
  } catch {
    /* private mode */
  }
  notify();
}

function engaged(): boolean {
  try {
    return localStorage.getItem(ENGAGED_KEY) === '1';
  } catch {
    return false;
  }
}

export function canOfferInstall(hasEvent: boolean, isEngaged: boolean, standalone: boolean): boolean {
  return hasEvent && isEngaged && !standalone;
}

export function useInstallPrompt(standalone: boolean): { show: boolean; install: () => Promise<void> } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const install = async () => {
    const e = deferred;
    if (!e) return;
    deferred = null; // the event can only be used once
    notify();
    await e.prompt();
    await e.userChoice.catch(() => undefined);
  };
  return { show: canOfferInstall(!!deferred, engaged(), standalone), install };
}
