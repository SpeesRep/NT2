import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';

let updateSW: ((reload?: boolean) => Promise<void>) | undefined;
const listeners = new Set<(v: boolean) => void>();
let needRefresh = false;

export function initPWA() {
  if (!('serviceWorker' in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      listeners.forEach((l) => l(true));
    },
    onRegisteredSW(_url, reg) {
      // Check for a new version when the app comes back to the foreground, and hourly.
      if (!reg) return;
      const check = () => navigator.onLine && reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      setInterval(check, 60 * 60 * 1000);
    }
  });
  // Ask the browser not to evict our IndexedDB / caches.
  navigator.storage?.persist?.().catch(() => {});
}

export function useNeedRefresh(): [boolean, () => void] {
  const [v, setV] = useState(needRefresh);
  useEffect(() => {
    listeners.add(setV);
    return () => void listeners.delete(setV);
  }, []);
  return [v, () => void updateSW?.(true)];
}

// One shared online flag for the whole app (every component sees the same value).
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
const onlineListeners = new Set<(v: boolean) => void>();
if (typeof window !== 'undefined') {
  const set = (v: boolean) => {
    online = v;
    onlineListeners.forEach((l) => l(v));
  };
  window.addEventListener('online', () => set(true));
  window.addEventListener('offline', () => set(false));
}

export function useOnline(): boolean {
  const [v, setV] = useState(online);
  useEffect(() => {
    onlineListeners.add(setV);
    setV(online); // in case it changed between render and subscribe
    return () => void onlineListeners.delete(setV);
  }, []);
  return v;
}

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad browser that can "Add to Home Screen" via its Share menu (Safari; Chrome/Edge/Firefox since iOS 16.4). */
export function isIosBrowser(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
