import { useEffect, useState } from 'preact/hooks';

// Progress lives only in this browser's storage, so ask the browser not to evict it ("persistent storage").
// Asked at the very first start (and again on later starts while not granted: browsers decide silently, e.g.
// after the app is added to the home screen). Without it, the Back-up screen shows a reminder.

let granted: boolean | null = null;
const listeners = new Set<(v: boolean | null) => void>();

/** Requests persistent storage; resolves true/false, or null when the browser has no Storage API. */
export async function persistStorage(): Promise<boolean | null> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!s?.persist) return (granted = null);
  try {
    granted = (await s.persisted?.()) || (await s.persist());
  } catch {
    granted = false;
  }
  listeners.forEach((l) => l(granted));
  return granted;
}

/** true = the browser keeps the data, false = it may clear it, null = unknown. */
export function usePersisted(): boolean | null {
  const [v, setV] = useState(granted);
  useEffect(() => {
    listeners.add(setV);
    return () => void listeners.delete(setV);
  }, []);
  return v;
}
