import { useEffect, useState } from 'preact/hooks';
import { NS } from './config';

// Small reactive store for the Settings values the UI needs before IndexedDB exists (stage 2 replaces
// the source with synced Settings). Cached in localStorage so it works offline.
const KEY = `${NS}:settings`;

export type UiSettings = { show_french_help: boolean };
const DEFAULTS: UiSettings = { show_french_help: true };

function load(): UiSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<(s: UiSettings) => void>();

export function setUiSettings(next: Partial<UiSettings>) {
  current = { ...current, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: keep in memory */
  }
  listeners.forEach((l) => l(current));
}

export function useUiSettings(): UiSettings {
  const [s, setS] = useState(current);
  useEffect(() => {
    listeners.add(setS);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

