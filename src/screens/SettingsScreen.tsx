import { useState } from 'preact/hooks';
import { t, type UIKey } from '../i18n';
import { setUserSetting, useSettingControls } from '../settings';
import { SETTING_ROWS } from '../userSettings';
import { BackupError, backupFileName, exportBackup, importBackup } from '../backup';
import { loadFromDb } from '../store';
import { showToast } from '../components/Toast';

/** "Instellingen": her own settings (phone only) + her JSON backup. Every change is saved at once. */
export function SettingsScreen({ onDone }: { onDone: () => void }) {
  const c = useSettingControls();
  const [busy, setBusy] = useState(false);

  const row = (key: (typeof SETTING_ROWS)[number]['key'], label: string) => {
    if (key === 'newPerDay') {
      return (
        <label class="setting-row" key={key}>
          <span class="setting-label">{t(label as UIKey)}</span>
          <select
            class="setting-select"
            value={c.newPerDay.selected === null ? '' : String(c.newPerDay.selected)}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              void setUserSetting('newPerDay', v === '' ? null : Number(v));
            }}
          >
            {c.newPerDay.options.map((o) => (
              <option key={o.isDefault ? 'default' : o.n} value={o.value === null ? '' : String(o.value)}>
                {o.isDefault ? t('settings.default', { n: o.n }) : String(o.n)}
              </option>
            ))}
          </select>
        </label>
      );
    }
    const tog = c[key];
    return (
      <div class="setting-row" key={key}>
        <span class="setting-label">{t(label as UIKey)}</span>
        <button
          class={`setting-toggle${tog.on ? ' on' : ''}`}
          role="switch"
          aria-checked={tog.on}
          aria-label={t(label as UIKey)}
          disabled={!tog.available}
          onClick={() => void setUserSetting(key, !tog.on)}
        >
          {tog.on ? t('settings.on') : t('settings.off')}
        </button>
        {!tog.available && <p class="setting-note muted">{t('settings.noVoice')}</p>}
      </div>
    );
  };

  const save = async () => {
    const blob = new Blob([JSON.stringify(await exportBackup(), null, 1)], { type: 'application/json' });
    const name = backupFileName();
    const file = new File([blob], name, { type: 'application/json' });
    // iPhone: the share sheet ("Bewaar in Bestanden"); elsewhere a normal download.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch {
        /* cancelled: fall back to a download */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const load = async (input: HTMLInputElement) => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    setBusy(true);
    try {
      await importBackup(JSON.parse(await f.text()));
      await loadFromDb();
      showToast(t('backup.done'));
    } catch (e) {
      showToast(e instanceof BackupError && e.message === 'otherApp' ? t('backup.otherApp') : t('backup.bad'), { ms: 5000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="topics settings">
      <h2 class="screen-title">{t('settings.title')}</h2>
      <section class="setting-list">{SETTING_ROWS.map((r) => row(r.key, r.label))}</section>

      <h3 class="setting-head">{t('backup.title')}</h3>
      <section class="setting-list">
        <button class="btn btn-secondary btn-block" onClick={() => void save()}>
          {t('backup.save')}
        </button>
        <label class={`btn btn-secondary btn-block${busy ? ' disabled' : ''}`}>
          {t('backup.load')}
          <input type="file" accept="application/json,.json" hidden disabled={busy} onChange={(e) => void load(e.target as HTMLInputElement)} />
        </label>
      </section>

      <button class="btn btn-primary btn-huge topics-done" onClick={onDone}>
        {t('tags.done')}
      </button>
    </main>
  );
}
