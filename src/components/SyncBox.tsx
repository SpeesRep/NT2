import { t } from '../i18n';
import { timeAgo } from '../format';
import { useStore } from '../store';
import { syncNow } from '../sync';
import { useOnline } from '../pwa';

/** Sync status (last sync, cards, unsent answers) + "Synchroniseren". Shown in the menu. Syncing itself is automatic. */
export function SyncBox() {
  const s = useStore();
  const online = useOnline();
  return (
    <div class="sync-box">
      <p class="sync-line">
        {s.sync === 'syncing'
          ? t('sync.running')
          : s.sync === 'error'
            ? t('sync.error')
            : s.lastSync
              ? t('sync.last', { ago: timeAgo(new Date(s.lastSync)) })
              : t('sync.never')}
        {s.cards.length > 0 && <span class="muted"> · {t('home.cards', { n: s.cards.length })}</span>}
      </p>
      {s.pending > 0 && <p class="sync-line">{t('sync.pending', { n: s.pending })}</p>}
      <button class="btn btn-secondary" disabled={!online || s.sync === 'syncing'} onClick={() => void syncNow()}>
        {t('sync.button')}
      </button>
    </div>
  );
}
