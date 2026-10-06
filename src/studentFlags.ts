// 🚩 Cards the learner marks during review ("Gemarkeerd"). LOCAL ONLY: stored in IndexedDB `flags`,
// never synced; the only way out is her own "Delen" (share sheet) or copy to clipboard.
// Not to be confused with Card.flags (false-friend / separable markers from the sheet).
import { db, type StudentFlag } from './db';
import { uuid } from './review';
import type { Card } from './types';
import { cardLabel } from './display';

/** Flags the card now. Every tap is a new entry (a card can be flagged again later). */
export async function createFlag(card_id: string, note = '', now = new Date()): Promise<StudentFlag> {
  const ts = now.toISOString();
  const d = await db();
  const card = await d.get('cards', card_id);
  const flag: StudentFlag = { id: uuid(), card_id, ts, note: note.trim(), resolved: false, updated_ts: ts };
  if (card) flag.label = cardLabel(card);
  await d.put('flags', flag);
  return flag;
}

async function update(id: string, patch: Partial<Pick<StudentFlag, 'note' | 'resolved'>>, now = new Date()): Promise<StudentFlag | null> {
  const d = await db();
  const tx = d.transaction('flags', 'readwrite');
  const cur = await tx.store.get(id);
  if (!cur) return null;
  const next: StudentFlag = { ...cur, ...patch, updated_ts: now.toISOString() };
  if (typeof next.note === 'string') next.note = next.note.trim();
  await tx.store.put(next);
  await tx.done;
  return next;
}

export function setFlagNote(id: string, note: string, now?: Date) {
  return update(id, { note }, now);
}

export function setFlagResolved(id: string, resolved: boolean, now?: Date) {
  return update(id, { resolved }, now);
}

/** All flags, newest first. */
export async function listFlags(): Promise<StudentFlag[]> {
  const all = await (await db()).getAll('flags');
  return all.sort((a, b) => b.ts.localeCompare(a.ts));
}

export function splitFlags(flags: StudentFlag[]): { open: StudentFlag[]; resolved: StudentFlag[] } {
  return { open: flags.filter((f) => !f.resolved), resolved: flags.filter((f) => f.resolved) };
}


/**
 * How the card is named in the list and the shared text: "het huis (la maison)". When the card is no longer
 * on the phone (e.g. not approved), the label saved in the flag; the id only as a last resort.
 */
export function flagCardLabel(card: Card | undefined, card_id: string, label?: string): string {
  return card ? cardLabel(card) : label || card_id;
}

/** All flags of one card, shown as ONE row (a card marked 3 times is listed once, "3×"). */
export type FlagGroup = {
  card_id: string;
  flags: StudentFlag[]; // newest first
  open: StudentFlag[]; // unresolved ones
  resolved: boolean; // true when none is open
  ts: string; // newest flag
  notes: string[]; // non-empty notes, newest first, no duplicates
  label?: string; // saved card name (newest flag that has one), for cards no longer on the phone
};

export function groupFlags(flags: StudentFlag[]): FlagGroup[] {
  const by = new Map<string, StudentFlag[]>();
  for (const f of [...flags].sort((a, b) => b.ts.localeCompare(a.ts))) {
    by.set(f.card_id, [...(by.get(f.card_id) ?? []), f]);
  }
  return [...by.entries()]
    .map(([card_id, list]) => {
      const open = list.filter((f) => !f.resolved);
      return {
        card_id, flags: list, open, resolved: open.length === 0, ts: list[0].ts,
        notes: [...new Set(list.map((f) => f.note).filter(Boolean))],
        label: list.find((f) => f.label)?.label
      };
    })
    .sort((a, b) => b.ts.localeCompare(a.ts));
}

/** Cards with at least one open 🚩 (home/menu count, lit 🚩 in review). */
export function openFlagCards(flags: StudentFlag[]): Set<string> {
  return new Set(flags.filter((f) => !f.resolved).map((f) => f.card_id));
}

/** "Opgelost" on a card resolves all its open flags; undoing reopens the newest one. */
export async function setCardResolved(group: FlagGroup, resolved: boolean, now?: Date): Promise<void> {
  if (resolved) for (const f of group.open) await setFlagResolved(f.id, true, now);
  else if (group.flags[0]) await setFlagResolved(group.flags[0].id, false, now);
}

/** Plain text for "Delen": a title, then one line per card with an open flag: word · notes (no date). */
export function exportText(flags: StudentFlag[], cards: Map<string, Card>, title: string): string {
  // Only the OPEN flags of each card count here (their newest date, their notes).
  const lines = groupFlags(flags)
    .filter((g) => !g.resolved)
    .map((g) => ({ g, ts: g.open[0].ts, notes: [...new Set(g.open.map((f) => f.note).filter(Boolean))] }))
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .map(({ g, notes }) => [flagCardLabel(cards.get(g.card_id), g.card_id, g.label), notes.join(' / ')].filter(Boolean).join(' · '));
  return [title, ...lines].join('\n');
}
