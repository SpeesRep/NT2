import { useState } from 'preact/hooks';
import { t, type UIKey } from '../i18n';
import { setUserSetting, useSettingControls } from '../settings';
import { SETTING_ROWS } from '../userSettings';
import { BackupError, backupFileName, exportBackup, importBackup, previewBackup, readBackupFile, type Backup } from '../backup';
import { usePersisted } from '../storage';
import { loadFromDb } from '../store';
import { showToast } from '../components/Toast';

/** "Instellingen": the learner's own settings (device only) + the JSON backup. Every change is saved at once. */
export function SettingsScreen({ onDone }: { onDone: () => void }) {
  const c = useSettingControls();
  const [busy, setBusy] = useState(false);
  const persisted = usePersisted();
  /** A checked backup that would replace records here: waits for "Vervangen" / "Annuleren". */
  const [pending, setPending] = useState<{ file: Backup; replace: number } | null>(null);

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

  const apply = async (file: Backup) => {
    setBusy(true);
    try {
      const n = await importBackup(file);
      await loadFromDb();
      showToast(t('backup.done', { n: n.progress }));
    } catch {
      showToast(t('backup.bad'), { ms: 5000 });
    } finally {
      setBusy(false);
    }
  };

  /** Checks the file, then imports at once, or first asks when it would replace progress on this device. */
  const load = async (input: HTMLInputElement) => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const file = await readBackupFile(f);
      const p = await previewBackup(file);
      if (p.skipped) showToast(t('backup.skipped', { n: p.skipped }), { ms: 5000 });
      if (p.replace > 0) setPending({ file, replace: p.replace });
      else await apply(file);
    } catch (e) {
      showToast(e instanceof BackupError && e.message === 'otherApp' ? t('backup.otherApp') : t('backup.bad'), { ms: 5000 });
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
        <p class="setting-note muted">{t(persisted === false ? 'backup.notPersisted' : 'backup.note')}</p>
      </section>

      {pending && (
        <div class="sheet-backdrop" onClick={() => setPending(null)}>
          <div class="sheet" role="alertdialog" aria-modal="true" aria-label={t('backup.confirmTitle')} onClick={(e) => e.stopPropagation()}>
            <h2>{t('backup.confirmTitle')}</h2>
            <p>{t('backup.confirm', { n: pending.replace })}</p>
            <button
              class="btn btn-primary btn-block"
              onClick={() => {
                const file = pending.file;
                setPending(null);
                void apply(file);
              }}
            >
              {t('backup.replace')}
            </button>
            <button class="btn btn-secondary btn-block" onClick={() => setPending(null)}>
              {t('backup.cancel')}
            </button>
          </div>
        </div>
      )}

      <button class="btn btn-primary btn-huge topics-done" onClick={onDone}>
        {t('tags.done')}
      </button>
    </main>
  );
}
