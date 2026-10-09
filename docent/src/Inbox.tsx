import { useEffect, useState } from 'preact/hooks';
import { call, type Group, type TCard } from './api';
import { CardView } from './CardView';

/** Cards the owner approved for this group, waiting for the teacher: Accepteren (students get it) or Verbergen. */
export function Inbox({ group, onCorrect }: { group: Group; onCorrect: (c: { id: string; nl: string }) => void }) {
  const [cards, setCards] = useState<TCard[] | null>(null);
  const [msg, setMsg] = useState('');
  const load = () => call<{ cards: TCard[] }>('inbox', { group: group.code }).then((r) => setCards(r.cards)).catch((e) => setMsg(e.message));
  useEffect(() => void load(), []);

  const decide = async (ids: string[], status: 'accepted' | 'hidden') => {
    setMsg('');
    try {
      const r = await call<{ done: string[]; refused: string[] }>('reviewCards', { group: group.code, decisions: ids.map((card_id) => ({ card_id, status })) });
      setCards((cs) => (cs ?? []).filter((c) => !r.done.includes(c.id)));
      setMsg(`${r.done.length} ${status === 'accepted' ? 'geaccepteerd' : 'verborgen'}${r.refused.length ? `, ${r.refused.length} niet gelukt` : ''}. Leerlingen krijgen dit bij de volgende keer Publiceren.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  if (!cards) return <p class="muted">{msg || 'Laden…'}</p>;
  return (
    <section>
      <h2>Inbox</h2>
      <p class="muted">Nieuwe kaarten voor {group.display_name}. Accepteer wat je leerlingen mogen oefenen. Een fout? Meld hem: de beheerder verbetert de kaart voor iedereen.</p>
      {msg && <p class="note" role="status">{msg}</p>}
      {cards.length === 0 ? (
        <p>De inbox is leeg. 🎉</p>
      ) : (
        <>
          <button class="btn primary" onClick={() => void decide(cards.map((c) => c.id), 'accepted')}>
            Alles accepteren ({cards.length})
          </button>
          <ul class="cards">
            {cards.map((c) => (
              <li key={c.id}>
                <CardView card={c} group={group} />
                <div class="actions">
                  <button class="btn primary" onClick={() => void decide([c.id], 'accepted')}>Accepteren</button>
                  <button class="btn" onClick={() => void decide([c.id], 'hidden')}>Verbergen</button>
                  <button class="btn link" onClick={() => onCorrect({ id: c.id, nl: c.nl })}>Fout melden</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
