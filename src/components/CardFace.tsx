import type { Card } from '../types';
import type { Mode } from '../session';
import { clozeParts, dutchText, flagLabel, isPictureFront, visibleFlags } from '../display';
import { useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { answerIsDutch, dutchSpeech, speakDutch } from '../tts';
import { SpeakButton } from './SpeakButton';
import { openmojiFor } from '../openmoji';

/**
 * One card in a given direction.
 *   nl_fr     front: Dutch (with de/het)      back: French
 *   fr_nl     front: French                   back: Dutch (with de/het)
 *   cloze     front: sentence with a blank + French translation    back: the missing word filled in
 *   question  front: French prompt            back: expected Dutch answer
 *   oneway    front: nl (Dutch prompt)        back: answer
 */
export function CardFace({ card, mode, revealed, readAnswer = false }: { card: Card; mode: Mode; revealed: boolean; readAnswer?: boolean }) {
  const shown = visibleFlags(card);
  const flags =
    shown.length > 0 ? (
      <div class="flags">
        {shown.map((f) => (
          <span class={`flag flag-${f}`} key={f}>
            {flagLabel(f)}
          </span>
        ))}
      </div>
    ) : null;

  const dutchWord = (
    <>
      {card.type === 'word' && card.article && <span class={`article article-${card.article}`}>{card.article} </span>}
      {card.type === 'word' ? card.nl : dutchText(card)}
    </>
  );

  const example = card.example_nl ? (
    <p class="card-example">
      <span lang="nl">{card.example_nl}</span>
      {card.example_fr && (
        <span class="card-example-fr" lang="fr">
          {card.example_fr}
        </span>
      )}
    </p>
  ) : null;

  const speech = dutchSpeech(card);
  // Listening card: try to play once when it appears (iOS may need the tap on 🔊 instead).
  useEffect(() => {
    if (mode === 'listen' && !revealed) speakDutch(speech);
  }, [card.id, mode]);
  // "Antwoord voorlezen": a Dutch answer is read out once when it is shown.
  useEffect(() => {
    if (revealed && readAnswer && answerIsDutch(mode)) speakDutch(speech);
  }, [card.id, mode, revealed]);

  // Listening card: only the sound first; the reveal shows the Dutch word and the French.
  if (mode === 'listen') {
    return (
      <article class="card" aria-live="polite">
        {!revealed ? (
          <>
            <SpeakButton text={speech} big />
            <p class="card-prompt">{t('audio.question')}</p>
          </>
        ) : (
          <>
            {flags}
            <p class="card-front" lang="nl">
              {dutchWord} <SpeakButton text={speech} />
            </p>
            <div class="card-back">
              <p class="card-answer" lang="fr">
                {card.fr}
              </p>
              {example}
            </div>
          </>
        )}
      </article>
    );
  }

  // enkel (oneway): the Dutch prompt (or its OpenMoji picture), then the answer (display text; she rates herself).
  if (mode === 'oneway') {
    const picture = openmojiFor(card.nl);
    // Emoji cards show the OpenMoji picture only — never the phone's own emoji. A missing picture gets a neutral
    // placeholder (and a warning for the teacher's test run: add it to scripts/openmoji-extra.json).
    const missing = !picture && isPictureFront(card.nl);
    if (missing) console.warn(`OpenMoji picture missing for card ${card.id}`);
    return (
      <article class="card" aria-live="polite">
        {flags}
        {picture ? (
          // OpenMoji picture (self-hosted, precached): the same image on every phone.
          <img class="card-picture" src={`${import.meta.env.BASE_URL}openmoji/${picture}.svg`} alt={card.nl.startsWith('openmoji:') ? '' : card.nl} width={320} height={320} />
        ) : missing ? (
          <div class="card-picture card-picture-missing" role="img" aria-label="?">
            ?
          </div>
        ) : (
          <p class="card-prompt card-prompt-big" lang="nl">
            {card.nl}
          </p>
        )}
        {card.fr && (
          <p class="card-prompt" lang="fr">
            {card.fr}
          </p>
        )}
        {revealed && (
          <div class="card-back">
            <p class="card-answer" lang="nl">
              {card.answer} {speech && <SpeakButton text={speech} />}
            </p>
            {example}
          </div>
        )}
      </article>
    );
  }

  if (mode === 'cloze') {
    const c = clozeParts(card.nl);
    return (
      <article class="card" aria-live="polite">
        {flags}
        <p class="card-sentence" lang="nl">
          {c.before}
          {revealed ? <mark class="cloze-answer">{c.answer}</mark> : <span class="cloze-blank">＿＿＿</span>}
          {c.after}
        </p>
        <p class="card-prompt" lang="fr">
          {card.fr}
        </p>
      </article>
    );
  }

  const nlFront = mode === 'nl_fr';
  return (
    <article class="card" aria-live="polite">
      {flags}
      {nlFront ? (
        <p class="card-front" lang="nl">
          {dutchWord} <SpeakButton text={speech} />
        </p>
      ) : (
        <p class={mode === 'question' ? 'card-prompt card-prompt-big' : 'card-front'} lang="fr">
          {card.fr}
        </p>
      )}
      {revealed && (
        <div class="card-back">
          {nlFront ? (
            <p class="card-answer" lang="fr">
              {card.fr}
            </p>
          ) : (
            <p class="card-answer" lang="nl">
              {dutchWord} <SpeakButton text={speech} />
            </p>
          )}
          {example}
        </div>
      )}
    </article>
  );
}
