import { useState } from 'preact/hooks';
import { HELP, t, type HelpScreen } from '../i18n';
import { useSettings } from '../settings';
import { helpSeen, isHelpUpdated, markHelpSeen } from '../helpSeen';

/** "Hulp" button + panel with the French instructions for one screen. Hidden when show_french_help is off. */
export function HelpButton({ screen }: { screen: HelpScreen }) {
  const show = useSettings().show_french_help;
  const [open, setOpen] = useState(false);
  const [, rerender] = useState(0);
  if (!show) return null;
  const text = HELP[screen].fr;
  const updated = isHelpUpdated(helpSeen(screen), text);
  const openHelp = () => {
    markHelpSeen(screen, text);
    setOpen(true);
    rerender((n) => n + 1);
  };
  return (
    <>
      <button class={`help-btn${updated ? ' updated' : ''}`} onClick={openHelp} aria-haspopup="dialog">
        <span class="help-icon" aria-hidden="true">
          ?
        </span>
        {t('help.button')}
        {updated && <span class="help-new">{t('help.updated')}</span>}
      </button>
      {open && (
        <div class="sheet-backdrop" onClick={() => setOpen(false)}>
          <div class="sheet" role="dialog" aria-modal="true" aria-label={t('help.title')} onClick={(e) => e.stopPropagation()}>
            <h2>{t('help.title')}</h2>
            <p lang="fr">{HELP[screen].fr}</p>
            <button class="btn btn-primary btn-block" onClick={() => setOpen(false)}>
              {t('help.close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
