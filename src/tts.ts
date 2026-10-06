import type { Card } from './types';
import { dutchText } from './display';

// Dutch speech with the phone's own voices (Web Speech API; works offline with an installed voice).
// No Dutch voice installed → no listening cards and a clear message on 🔊.

type VoiceLike = Pick<SpeechSynthesisVoice, 'lang' | 'name' | 'localService'>;

/** Best Dutch voice: nl-NL, then nl-BE, then any nl-*; local (offline) voices first. */
export function pickDutchVoice<V extends VoiceLike>(voices: V[]): V | null {
  const nl = voices.filter((v) => /^nl([-_]|$)/i.test(v.lang));
  const rank = (v: V) => (/^nl[-_]NL/i.test(v.lang) ? 0 : /^nl[-_]BE/i.test(v.lang) ? 1 : 2) + (v.localService ? 0 : 0.5);
  return nl.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/** What to say for a card: the Dutch side (with de/het), never the French part of an answer. */
export function dutchSpeech(card: Card): string {
  if (card.type === 'oneway') {
    // "de minuut, de minuten — minute(s)" → before the dash; "10:00u of tien uur 's ochtends" stays.
    const answer = card.answer.split(/\s+—\s+/)[0].trim();
    return /\p{L}/u.test(answer) ? answer : '';
  }
  if (card.type === 'question') return card.nl;
  return dutchText(card);
}

/** Card directions whose answer (the back) is Dutch: read out loud when shown, if "Antwoord voorlezen" is on. */
export function answerIsDutch(mode: string): boolean {
  return mode === 'fr_nl' || mode === 'question' || mode === 'cloze' || mode === 'oneway';
}

/**
 * Is this word-recognition review a listening card? Deterministic per card and review number, so the same
 * card is not always audio, and about `share` of them are.
 */
/**
 * Is this review a listening card? Only when listening is on (a Dutch voice exists and she did not switch it off
 * in Instellingen), for word recognition, and for about listen_share of those reviews.
 */
export function listenMode(card: Card, track: string, reps: number, s: { listening: boolean; listen_share: number }): boolean {
  return s.listening && track === 'recog' && isListeningReview(card, reps, s.listen_share);
}

export function isListeningReview(card: Card, reps: number, share: number): boolean {
  if (card.type !== 'word' || share <= 0) return false;
  let h = 2166136261;
  for (const ch of `${card.id}:${reps}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000 < share;
}

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

let cached: SpeechSynthesisVoice | null | undefined;

export function dutchVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  if (cached === undefined || cached === null) cached = pickDutchVoice(s.getVoices());
  return cached;
}

/** Voices load asynchronously on some browsers (Chrome/Android): resolves once they are known. */
export function voicesReady(timeoutMs = 1500): Promise<SpeechSynthesisVoice | null> {
  const s = synth();
  if (!s) return Promise.resolve(null);
  if (s.getVoices().length) return Promise.resolve(dutchVoice());
  return new Promise((resolve) => {
    const done = () => {
      cached = undefined;
      resolve(dutchVoice());
    };
    s.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, timeoutMs);
  });
}

/** Speaks Dutch text. Returns false when there is no Dutch voice (the caller shows the message). */
export function speakDutch(text: string): boolean {
  const s = synth();
  const voice = dutchVoice();
  if (!s || !voice || !text) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.9;
  s.speak(u);
  return true;
}
