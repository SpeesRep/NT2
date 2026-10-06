import { t } from '../i18n';

/** Text with its http(s) addresses as links (they open outside the app). */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer">
            {p}
          </a>
        ) : (
          p
        )
      )}
    </>
  );
}

/** "Over SpeesRep": what the app is, privacy, and the image credit (OpenMoji, CC BY-SA 4.0). */
export function AboutScreen({ onDone }: { onDone: () => void }) {
  return (
    <main class="topics about">
      <h2 class="screen-title">{t('about.title')}</h2>
      <p>{t('about.intro')}</p>
      <p>{t('about.privacy')}</p>
      <h3 class="setting-head">{t('about.imagesTitle')}</h3>
      <p>
        <Linked text={t('about.images')} />
      </p>
      <p>
        <Linked text={t('about.license')} />
      </p>
      <p class="muted" lang="en">
        {t('about.imagesEn')}
      </p>
      <button class="btn btn-primary btn-huge topics-done" onClick={onDone}>
        {t('tags.done')}
      </button>
    </main>
  );
}
