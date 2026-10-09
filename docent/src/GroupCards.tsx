import { useEffect, useMemo, useState } from 'preact/hooks';
import { call, type Group, type TCard } from './api';
import { CardView } from './CardView';

/** The group's accepted and hidden cards: look back, hide one, or bring a hidden one back. */
export function GroupCards({ group, onCorrect }: { group: Group; onCorrect: (c: { id: string; nl: string }) => void }) {
  const [cards, setCards] = useState<TCard[] | null>(null);
  const [show, setShow] = useState<'accepted' | 'hidden'>('accepted');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => void call<{ cards: TCard[] }>('groupCards', { group: group.code }).then((r) => setCards(r.cards)).catch((e) => setMsg(e.message)), []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (cards ?? []).filter((c) => c.group_status === show && (!s || [c.nl, c.answer, ...Object.values(c.translations).map((t) => t.text)].join(' ').toLowerCase().includes(s)));
  }, [cards, show, q]);

  const set = async (c: TCard, status: 'accepted' | 'hidden') => {
    try {
      const r = await call<{ done: string[] }>('reviewCards', { group: group.code, decisions: [{ card_id: c.id, status }] });
      if (r.done.length) setCards((cs) => (cs ?? []).map((x) => (x.id === c.id ? { ...x, group_status: status } : x)));
      setMsg('Opgeslagen. Leerlingen krijgen dit bij de volgende keer Publiceren.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  if (!cards) return <p class="muted">{msg || 'Laden…'}</p>;
  const count = (st: string) => cards.filter((c) => c.group_status === st).length;
  return (
    <section>
      <h2>Kaarten</h2>
      <div class="row">
        <div class="seg">
          <button class={show === 'accepted' ? 'on' : ''} onClick={() => setShow('accepted')}>Geaccepteerd ({count('accepted')})</button>
          <button class={show === 'hidden' ? 'on' : ''} onClick={() => setShow('hidden')}>Verborgen ({count('hidden')})</button>
        </div>
        <input type="search" placeholder="Zoeken…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Zoeken" />
      </div>
      {msg && <p class="note" role="status">{msg}</p>}
      <ul class="cards">
        {shown.slice(0, 200).map((c) => (
          <li key={c.id}>
            <CardView card={c} group={group} />
            <div class="actions">
              {show === 'accepted' ? (
                <button class="btn" onClick={() => void set(c, 'hidden')}>Verbergen</button>
              ) : (
                <button class="btn primary" onClick={() => void set(c, 'accepted')}>Terugzetten</button>
              )}
              <button class="btn link" onClick={() => onCorrect({ id: c.id, nl: c.nl })}>Fout melden</button>
            </div>
          </li>
        ))}
      </ul>
      {shown.length > 200 && <p class="muted">Eerste 200 van {shown.length}. Zoek om er minder te zien.</p>}
    </section>
  );
}
