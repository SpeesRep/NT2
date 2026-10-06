import { useEffect, useState } from 'preact/hooks';

// One small, non-blocking toast at a time (top of the screen; never covers the rating buttons).
type ToastMsg = { id: number; text: string; action?: { label: string; run: () => void }; ms: number };
let current: ToastMsg | null = null;
let seq = 0;
const listeners = new Set<(t: ToastMsg | null) => void>();

export function showToast(text: string, opts: { action?: ToastMsg['action']; ms?: number } = {}) {
  current = { id: ++seq, text, action: opts.action, ms: opts.ms ?? 1500 };
  listeners.forEach((l) => l(current));
}

export function Toast() {
  const [msg, setMsg] = useState<ToastMsg | null>(current);
  useEffect(() => {
    listeners.add(setMsg);
    return () => void listeners.delete(setMsg);
  }, []);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => {
      if (current?.id === msg.id) current = null;
      setMsg((m) => (m?.id === msg.id ? null : m));
    }, msg.ms);
    return () => clearTimeout(id);
  }, [msg]);
  if (!msg) return null;
  return (
    <div class="toast" role="status" aria-live="polite">
      <span>{msg.text}</span>
      {msg.action && (
        <button
          class="toast-action"
          onClick={() => {
            msg.action!.run();
            setMsg(null);
          }}
        >
          {msg.action.label}
        </button>
      )}
    </div>
  );
}
