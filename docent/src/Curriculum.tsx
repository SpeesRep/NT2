import { useEffect, useState } from 'preact/hooks';
import { call, type Check, type CurRow, type Group, type Topic } from './api';

const RULES: [string, string][] = [
  ['always', 'altijd'],
  ['date', 'vanaf datum'],
  ['known', 'als andere onderwerpen bekend zijn'],
  ['closed', 'dicht']
];

type Loaded = { rows: CurRow[]; version: number; topics: Topic[] };

/**
 * The group's curriculum: which topics bring new cards, in which order, and when they open. Saving checks the
 * version on the server: when a colleague saved first, nothing is overwritten.
 */
export function Curriculum({ group }: { group: Group }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [rows, setRows] = useState<CurRow[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [msg, setMsg] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setConflict(false);
    setChecks([]);
    return call<Loaded>('getCurriculum', { group: group.code }).then((d) => {
      setData(d);
      setRows(d.rows.map((r) => ({ ...r })));
    }).catch((e) => setMsg(e.message));
  };
  useEffect(() => void load(), []);
  if (!data) return <p class="muted">{msg || 'Laden…'}</p>;

  const label = (tag: string) => data.topics.find((t) => t.tag === tag)?.label ?? tag;
  const cardsOf = (tag: string) => data.topics.find((t) => t.tag === tag)?.cards ?? 0;
  const update = (i: number, patch: Partial<CurRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const next = rs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      // "bekend" may only wait for topics ABOVE: drop the ones that are now below.
      return next.map((r, k) => ({ ...r, from_tags: r.from_tags.filter((t) => next.slice(0, k).some((x) => x.tag === t)) }));
    });
  const unused = data.topics.filter((t) => !rows.some((r) => r.tag === t.tag) && t.bank > 0);

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await call<{ saved: boolean; version?: number; conflict?: boolean; checks?: Check[] }>('saveCurriculum', {
        group: group.code, version: data.version, rows: rows.map((x, i) => ({ ...x, order: i + 1 }))
      });
      if (r.conflict) setConflict(true);
      else if (!r.saved) {
        setChecks(r.checks ?? []);
        setMsg('Niet opgeslagen: verbeter eerst de rode punten.');
      } else {
        setData({ ...data, rows, version: r.version! });
        setChecks(r.checks ?? []);
        setMsg('Opgeslagen. Leerlingen krijgen dit bij de volgende keer Publiceren.');
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>Curriculum</h2>
      <p class="muted">Bovenaan = eerst nieuwe kaarten. „Dicht” = geparkeerd: geen nieuwe kaarten, begonnen kaarten komen wel terug.</p>
      {conflict && (
        <p class="error" role="alert">
          Een collega heeft dit intussen veranderd. Er is niets overschreven.{' '}
          <button class="btn" onClick={() => void load()}>Opnieuw laden</button>
        </p>
      )}
      <ol class="cur">
        {rows.map((r, i) => (
          <li key={r.tag} class={r.rule === 'closed' ? 'closed' : ''}>
            <div class="cur-head">
              <strong>{label(r.tag)}</strong>
              <span class="muted small">{cardsOf(r.tag)} kaarten</span>
              <span class="grow" />
              <button class="btn small" aria-label="Omhoog" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button class="btn small" aria-label="Omlaag" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
            </div>
            <div class="cur-rule">
              <select value={r.rule} onChange={(e) => update(i, { rule: (e.target as HTMLSelectElement).value })} aria-label={`Regel voor ${label(r.tag)}`}>
                {RULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {r.rule === 'date' && (
                <input type="date" value={r.date} onInput={(e) => update(i, { date: (e.target as HTMLInputElement).value })} aria-label="Datum" />
              )}
              {r.rule === 'known' && (
                <>
                  <input type="number" min={1} max={100} value={r.percentage ?? ''} class="pct" aria-label="Percentage"
                    onInput={(e) => update(i, { percentage: Number((e.target as HTMLInputElement).value) || null })} />
                  <span>% bekend van:</span>
                  {rows.slice(0, i).map((up) => (
                    <label key={up.tag} class="chk">
                      <input type="checkbox" checked={r.from_tags.includes(up.tag)}
                        onChange={(e) => update(i, { from_tags: (e.target as HTMLInputElement).checked ? [...r.from_tags, up.tag] : r.from_tags.filter((t) => t !== up.tag) })} />
                      {label(up.tag)}
                    </label>
                  ))}
                </>
              )}
            </div>
            {checks[i] && (checks[i].errors.length > 0 || checks[i].warnings.length > 0) && (
              <ul class="checks">
                {checks[i].errors.map((m) => <li key={m} class="error">{m}</li>)}
                {checks[i].warnings.map((m) => <li key={m} class="warn">{m}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {unused.length > 0 && (
        <p>
          <select aria-label="Onderwerp toevoegen" value="" onChange={(e) => {
            const tag = (e.target as HTMLSelectElement).value;
            if (tag) setRows((rs) => [...rs, { order: rs.length + 1, tag, rule: 'closed', date: '', percentage: null, from_tags: [] }]);
          }}>
            <option value="">+ Onderwerp toevoegen…</option>
            {unused.map((t) => <option key={t.tag} value={t.tag}>{t.label} ({t.bank} kaarten)</option>)}
          </select>
        </p>
      )}
      {msg && <p class="note" role="status">{msg}</p>}
      <div class="savebar">
        <button class="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
        <button class="btn" disabled={busy} onClick={() => void load()}>Wijzigingen weggooien</button>
      </div>
    </section>
  );
}
