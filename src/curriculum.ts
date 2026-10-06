import type { Card, CurriculumRow } from './types';
import { progressKey, type Progress, type Track } from './scheduler';

// Curriculum — which topics may bring NEW cards, and in what order. Each row carries its OWN rule (the row above
// no longer opens the next one):
//   always  (altijd)  open from the start
//   date    (datum)   open from local midnight on `date`
//   known   (bekend)  open when EVERY tag in `from_tags` has >= `percentage` % of its active cards bekend
//   closed  (dicht)   closed now; the other columns are ignored (kept for later) and the latch is cleared
// Once a topic opens it stays open (latched in meta.curriculumOpened) unless its row says dicht. A tag without a
// row never opens (unless latched before its row was deleted). apps-script/Curriculum.gs mirrors validation and
// status for the Dashboard and the teacher editor — keep both in sync (src/curriculumParity.test.ts).

export type Validation = { errors: string[]; warnings: string[] };

export type TagStatus = {
  order: number;
  tag: string;
  rule: string;
  date: string;
  percentage: number | null;
  from_tags: string[];
  errors: string[];
  warnings: string[];
  cards: number; // active cards with this tag
  known: number;
  score: number; // known / cards (1 when the tag has no cards)
  open: boolean;
  latched: boolean; // open because it opened earlier (meta.curriculumOpened)
  state: 'open' | 'date' | 'waiting' | 'closed' | 'error';
  /** For `known`: the score of every from_tag (0–1). */
  fromScores: { tag: string; score: number }[];
};

export type CurriculumResult = {
  rows: TagStatus[];
  /** Tags whose new cards may come: open rows (by order), then latched tags whose row is gone. */
  open: string[];
  /** The new meta.curriculumOpened (tag → local date it opened). */
  opened: Record<string, string>;
};

export type KnownRule = { known_stability_days: number; known_min_reviews: number };

/** The track that represents "knowing" a card: recog for words, prod for sentences/questions. */
export function primaryTrack(card: Card): Track {
  return card.type === 'word' ? 'recog' : 'prod';
}

export function isKnown(p: Progress | undefined, rule: KnownRule): boolean {
  return !!p && p.stability >= rule.known_stability_days && p.reps >= rule.known_min_reviews;
}

const RULES = ['always', 'date', 'known', 'closed'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * The shared validation (same rules and Dutch messages as validateCurriculum_ in apps-script/Curriculum.gs).
 * Returns one {errors, warnings} per input row, in input order. cardCounts (optional) adds the
 * "no active cards" warning.
 */
export function validateCurriculum(rows: CurriculumRow[], tagKeys: string[], cardCounts?: Record<string, number>): Validation[] {
  const known = new Set(tagKeys);
  const firstRow: Record<string, CurriculumRow> = {};
  const orderCount: Record<string, number> = {};
  rows.forEach((r) => {
    if (r.tag && !firstRow[r.tag]) firstRow[r.tag] = r;
    orderCount[String(r.order)] = (orderCount[String(r.order)] ?? 0) + 1;
  });
  return rows.map((r) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!r.tag) errors.push('Vul een tag in.');
    else if (!known.has(r.tag)) errors.push(`Tag "${r.tag}" staat niet in het tabblad Tags.`);
    else if (firstRow[r.tag] !== r) errors.push(`Tag "${r.tag}" staat al hoger in het curriculum.`);
    if (!(Number.isInteger(r.order) && r.order >= 1)) errors.push('Vul bij order een heel getal in (1, 2, 3 …).');
    else if (orderCount[String(r.order)] > 1) errors.push(`Order ${r.order} komt meer dan één keer voor.`);
    if (r.rule === 'closed') return { errors, warnings };
    if (RULES.indexOf(r.rule) === -1) {
      errors.push(r.rule ? `Onbekende regel "${r.rule}": kies altijd, datum, bekend of dicht.` : 'Kies een regel: altijd, datum, bekend of dicht.');
    } else if (r.rule === 'date') {
      if (!validDate(r.date)) errors.push('Regel datum: vul een geldige datum in.');
    } else if (r.rule === 'known') {
      if (r.percentage === null || !Number.isInteger(r.percentage) || r.percentage < 1 || r.percentage > 100) {
        errors.push('Regel bekend: vul een percentage in van 1 tot 100.');
      }
      if (!r.from_tags.length) errors.push('Regel bekend: vul bij van_tags minstens één onderwerp in.');
      r.from_tags.forEach((ft) => {
        const src = firstRow[ft];
        if (!known.has(ft)) errors.push(`van_tags: "${ft}" staat niet in het tabblad Tags.`);
        else if (!src) errors.push(`van_tags: "${ft}" staat niet in het curriculum.`);
        else if (!(src.order < r.order)) errors.push(`van_tags: "${ft}" moet hoger in de lijst staan dan "${r.tag}".`);
        else if (src.rule === 'closed') warnings.push(`${r.tag} wacht op ${ft}, dat nu dicht is.`);
      });
    }
    if (cardCounts && r.tag && !cardCounts[r.tag]) warnings.push('Dit onderwerp heeft geen actieve kaarten.');
    return { errors, warnings };
  });
}

/**
 * Evaluates every row (sorted by order) for `today` (the phone's local date, YYYY-MM-DD) and the latch.
 * Pure: the caller stores `opened` when it changed.
 */
export function curriculumStatus(
  rows: CurriculumRow[],
  cards: Card[],
  progress: Map<string, Progress>,
  rule: KnownRule,
  today: string,
  opened: Record<string, string>,
  tagKeys: string[]
): CurriculumResult {
  const checks = validateCurriculum(rows, tagKeys);
  const scores: Record<string, { cards: number; known: number }> = {};
  const scoreOf = (tag: string) => {
    if (!scores[tag]) {
      const tagged = cards.filter((c) => c.tags.includes(tag));
      const k = tagged.filter((c) => isKnown(progress.get(progressKey(c.id, primaryTrack(c))), rule)).length;
      scores[tag] = { cards: tagged.length, known: k };
    }
    return scores[tag];
  };
  const pct = (s: { cards: number; known: number }) => (s.cards ? s.known / s.cards : 1);

  const latch: Record<string, string> = { ...opened };
  const sorted = rows.map((r, i) => ({ r, v: checks[i], i })).sort((a, b) => a.r.order - b.r.order || a.i - b.i);
  const out: TagStatus[] = sorted.map(({ r, v }) => {
    const own = scoreOf(r.tag);
    const fromScores = r.rule === 'known' ? r.from_tags.map((t) => ({ tag: t, score: pct(scoreOf(t)) })) : [];
    let open = false;
    let latched = false;
    let state: TagStatus['state'];
    if (r.rule === 'closed') {
      state = 'closed';
      if (v.errors.length === 0) delete latch[r.tag];
    } else if (opened[r.tag]) {
      open = latched = true;
      state = 'open';
    } else if (v.errors.length) {
      state = 'error';
    } else if (r.rule === 'always') {
      open = true;
      state = 'open';
    } else if (r.rule === 'date') {
      open = today >= r.date;
      state = open ? 'open' : 'date';
    } else {
      const s = r.from_tags.map((t) => scoreOf(t));
      open = s.every((x) => x.known * 100 >= (r.percentage ?? 101) * x.cards);
      state = open ? 'open' : 'waiting';
    }
    if (open && !latched && !latch[r.tag]) latch[r.tag] = today;
    return {
      order: r.order, tag: r.tag, rule: r.rule, date: r.date, percentage: r.percentage, from_tags: r.from_tags,
      errors: v.errors, warnings: v.warnings, cards: own.cards, known: own.known, score: pct(own), open, latched, state, fromScores
    };
  });
  const withRow = new Set(rows.map((r) => r.tag));
  const openList = [...new Set([...out.filter((s) => s.open).map((s) => s.tag), ...Object.keys(latch).filter((t) => !withRow.has(t))])];
  return { rows: out, open: openList, opened: latch };
}

export type Picker = {
  /** May this card be introduced as new? */
  eligible: (card: Card) => boolean;
  /** Chooses up to `slots` new cards from candidates (already in `added` order). */
  pickNew: (candidates: Card[], slots: number) => Card[];
};

/**
 * A card is eligible when AT LEAST ONE of its tags is open (untagged cards never are). Slots are filled from
 * the open topics in `order` (cards in `added` order); a card matching several open tags is picked once.
 */
export function makePicker(open: string[]): Picker {
  const set = new Set(open);
  const eligible = (card: Card) => card.tags.some((t) => set.has(t));
  const pickNew = (candidates: Card[], slots: number) => {
    const picked: Card[] = [];
    const seen = new Set<string>();
    for (const tag of open) {
      for (const c of candidates) {
        if (picked.length >= slots) return picked;
        if (!seen.has(c.id) && c.tags.includes(tag)) {
          seen.add(c.id);
          picked.push(c);
        }
      }
    }
    return picked;
  };
  return { eligible, pickNew };
}

/** "Kies een onderwerp": tags with a Curriculum row that is not dicht; locked = not open yet. */
export function topicChoices(result: CurriculumResult): { tag: string; locked: boolean }[] {
  return result.rows.filter((s) => s.rule !== 'closed' && s.tag).map((s) => ({ tag: s.tag, locked: !s.open }));
}

/** Did the latch change (so it must be stored)? */
export function latchChanged(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length !== kb.length || ka.some((k) => a[k] !== b[k]);
}
