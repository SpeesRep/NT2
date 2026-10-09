import { useState } from 'preact/hooks';
import { t, type HelpScreen } from '../i18n';
import { helpText } from '../helpLang';
import { useStore } from '../store';
import { useSettings } from '../settings';
import { helpSeen, isHelpUpdated, markHelpSeen } from '../helpSeen';

/**
 * "Hulp" button + panel with the instructions for one screen in the student's help language. Hidden when
 * show_french_help (= show help) is off, without a help language, or when that language has no text for the screen.
 */
export function HelpButton({ screen }: { screen: HelpScreen }) {
  const show = useSettings().show_french_help;
  const lang = useStore().helpLang ?? '';
  const [open, setOpen] = useState(false);
  const [, rerender] = useState(0);
  const text = helpText(screen, lang);
  if (!show || !text) return null;
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
            <p lang={lang} dir="auto">
              {text}
            </p>
            <button class="btn btn-primary btn-block" onClick={() => setOpen(false)}>
              {t('help.close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
