import { useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { createFlag, setFlagNote } from '../studentFlags';
import { showToast } from './Toast';
import { refreshFlagCount, useStore } from '../store';

/**
 * 🚩 in the corner of every card. Tap = flag now (+ "Gemarkeerd" toast with "+ notitie").
 * Long-press = flag and open the note field. Never blocks the review: the toast is non-modal.
 */
export function FlagButton({ cardId }: { cardId: string }) {
  const s = useStore();
  const lit = s.flaggedCards.includes(cardId);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const longPressed = useRef(false);

  const flag = async (withNote: boolean) => {
    const f = await createFlag(cardId);
    void refreshFlagCount();
    if (withNote) {
      setNote('');
      setNoteFor(f.id);
    } else {
      showToast(t('mark.done'), { ms: 3000, action: { label: t('mark.addNote'), run: () => (setNote(''), setNoteFor(f.id)) } });
    }
  };

  const down = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      void flag(true);
    }, 550);
  };
  const up = () => clearTimeout(timer.current);
  const click = () => {
    if (longPressed.current) return;
    void flag(false);
  };

  const save = async () => {
    if (noteFor && note.trim()) await setFlagNote(noteFor, note);
    setNoteFor(null);
    showToast(t('mark.done'));
  };

  return (
    <>
      <button
        class={`flag-btn${lit ? ' lit' : ''}`}
        aria-label={t('mark.button')}
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={up}
        onContextMenu={(e) => e.preventDefault()}
        onClick={click}
      >
        🚩
      </button>
      {noteFor && (
        <div class="note-bar" role="dialog" aria-label={t('mark.addNote')}>
          <input
            class="note-input"
            type="text"
            maxLength={140}
            value={note}
            placeholder={t('mark.notePlaceholder')}
            onInput={(e) => setNote((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            autoFocus
            autoComplete="off"
          />
          <button class="btn btn-primary btn-small" onClick={() => void save()}>
            {t('mark.save')}
          </button>
        </div>
      )}
    </>
  );
}
