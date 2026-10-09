import { useState } from 'preact/hooks';
import { call, type Group } from './api';

/** Publiceren: GitHub rebuilds the site with every group's word list (a few minutes; max 4× per hour per group). */
export function Publish({ group }: { group: Group }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setMsg('');
    try {
      await call('publish', { group: group.code });
      setMsg('Verstuurd. Over ± 3 minuten hebben je leerlingen de nieuwe woordenlijst (de app haalt hem zelf op).');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2>Publiceren</h2>
      <p>Wat je in de Inbox, bij Kaarten en in het Curriculum veranderde, komt pas bij je leerlingen na Publiceren.</p>
      <button class="btn primary" disabled={busy} onClick={() => void go()}>{busy ? 'Bezig…' : `Publiceren (${group.display_name})`}</button>
      {msg && <p class="note" role="status">{msg}</p>}
    </section>
  );
}
