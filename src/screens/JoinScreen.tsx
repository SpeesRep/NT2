import { useState } from 'preact/hooks';
import { t, type UIKey } from '../i18n';
import { isCode, normalizeCode } from '../group';
import { fetchGroup, joinGroup } from '../sync';

/**
 * "Je groep": the student types the group code (from the teacher; usually a link or QR code does it). The code is
 * checked by GETting the group's content.json from the app's own site — nothing is sent. Shown at the first start
 * (there is no default group) and from the menu (another group; progress stays with the cards).
 */
export function JoinScreen({ initial = '', message = null, onCancel, onJoined }: { initial?: string; message?: UIKey | null; onCancel?: () => void; onJoined?: () => void }) {
  const [code, setCode] = useState(initial);
  const [error, setError] = useState<UIKey | null>(message);
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!isCode(c)) return setError('join.bad');
    setBusy(true);
    setError(null);
    try {
      const res = await fetchGroup(c);
      if (res.status === 'ok') {
        await joinGroup(c, res.content);
        onJoined?.();
      }
      else setError(res.status === 'offline' ? 'join.offline' : res.status === 'stopped' ? 'join.stopped' : 'join.unknown');
    } catch {
      setError('join.unknown');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="topics join">
      <h2 class="screen-title">{t('join.title')}</h2>
      <p>{t('join.text')}</p>
      <form onSubmit={submit}>
        <label class="join-label" for="group-code">
          {t('join.label')}
        </label>
        <input
          id="group-code"
          class="join-input"
          value={code}
          onInput={(e) => setCode((e.target as HTMLInputElement).value)}
          autocomplete="off"
          autocapitalize="none"
          spellcheck={false}
          inputMode="text"
          maxLength={12}
          dir="ltr"
        />
        {error && (
          <p class="join-error" role="alert">
            {t(error)}
          </p>
        )}
        <button class="btn btn-primary btn-huge" type="submit" disabled={busy}>
          {busy ? t('join.busy') : t('join.button')}
        </button>
      </form>
      {onCancel && (
        <button class="btn btn-secondary btn-block" onClick={onCancel}>
          {t('join.cancel')}
        </button>
      )}
    </main>
  );
}
