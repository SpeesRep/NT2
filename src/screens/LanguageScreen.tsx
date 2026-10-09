import { t } from '../i18n';
import { langName } from '../helpLang';
import { setHelpLang } from '../language';

/**
 * "Je hulptaal": the group's help languages (each named in its own language) or none. The choice stays on the
 * device (meta.helpLang) and can be changed in Instellingen.
 */
export function LanguageScreen({ languages, onDone }: { languages: string[]; onDone?: () => void }) {
  const pick = async (lang: string) => {
    await setHelpLang(lang, languages);
    onDone?.();
  };
  return (
    <main class="topics language">
      <h2 class="screen-title">{t('lang.title')}</h2>
      <p>{t('lang.text')}</p>
      <div class="lang-list">
        {languages.map((l) => (
          <button key={l} class="btn btn-secondary btn-block lang-choice" lang={l} dir="auto" onClick={() => void pick(l)}>
            {langName(l)}
          </button>
        ))}
        <button class="btn btn-secondary btn-block lang-choice" onClick={() => void pick('')}>
          {t('lang.none')}
        </button>
      </div>
    </main>
  );
}
