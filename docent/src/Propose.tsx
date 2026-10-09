import { useState } from 'preact/hooks';
import { call, type Group } from './api';

/** New words or a correction: they go to the owner, who adds or fixes the card for every group. */
export function Propose({ group, correction, onDone }: { group: Group; correction: { id: string; nl: string } | null; onDone: () => void }) {
  const [nl, setNl] = useState('');
  const [example, setExample] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const send = async (e: Event) => {
    e.preventDefault();
    setMsg('');
    try {
      const proposal = correction ? { type: 'correction', card_id: correction.id, note } : { type: 'new', nl, example_nl: example, note };
      await call('propose', { group: group.code, proposal });
      setMsg(correction ? 'Bedankt! De beheerder bekijkt de fout.' : `Bedankt! "${nl}" staat in de lijst voor de beheerder.`);
      setNl('');
      setExample('');
      setNote('');
      onDone();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };
  return (
    <section>
      <h2>{correction ? `Fout melden: ${correction.nl}` : 'Woord voorstellen'}</h2>
      <form class="form" onSubmit={send}>
        {!correction && (
          <>
            <label>Nederlands woord of zin<input required value={nl} onInput={(e) => setNl((e.target as HTMLInputElement).value)} maxLength={200} /></label>
            <label>Voorbeeldzin (mag leeg)<input value={example} onInput={(e) => setExample((e.target as HTMLInputElement).value)} maxLength={300} /></label>
          </>
        )}
        <label>
          {correction ? 'Wat klopt er niet?' : 'Opmerking (mag leeg)'}
          <textarea required={!!correction} value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} maxLength={1000} />
        </label>
        <div class="row">
          <button class="btn primary" type="submit">Versturen</button>
          {correction && <button class="btn" type="button" onClick={onDone}>Annuleren</button>}
        </div>
      </form>
      {msg && <p class="note" role="status">{msg}</p>}
      <p class="muted small">Een woordenlijst? Stuur hem naar de beheerder: die maakt er kaarten van (met plaatje en vertalingen).</p>
    </section>
  );
}
