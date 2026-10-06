import { t } from '../i18n';
import { speakDutch } from '../tts';
import { showToast } from './Toast';

/** 🔊 — speaks Dutch with the phone's voice; clear message when no Dutch voice is installed. */
export function SpeakButton({ text, big }: { text: string; big?: boolean }) {
  if (!text) return null;
  const say = (e: Event) => {
    e.stopPropagation();
    if (!speakDutch(text)) showToast(t('audio.noVoice'), { ms: 4000 });
  };
  return (
    <button class={big ? 'speak-btn speak-big' : 'speak-btn'} onClick={say} aria-label={t('audio.play')}>
      🔊{big && <span class="speak-label">{t('audio.listen')}</span>}
    </button>
  );
}
