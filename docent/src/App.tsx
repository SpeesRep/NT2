import { useEffect, useState } from 'preact/hooks';
import { ApiError, call, forgetKey, getKey, type Group } from './api';
import { Inbox } from './Inbox';
import { GroupCards } from './GroupCards';
import { Curriculum } from './Curriculum';
import { Share } from './Share';
import { Publish } from './Publish';
import { Propose } from './Propose';

type Me = { label: string; groups: Group[] };
type Tab = 'inbox' | 'cards' | 'curriculum' | 'share' | 'publish' | 'propose';
const TABS: [Tab, string][] = [
  ['inbox', 'Inbox'],
  ['cards', 'Kaarten'],
  ['curriculum', 'Curriculum'],
  ['share', 'Leerlingen uitnodigen'],
  ['publish', 'Publiceren'],
  ['propose', 'Woord voorstellen']
];
const GROUP_KEY = `speesrep-docent-group-${__DOCENT_ENV__}`;

/** The teacher page: invite-key login, then the teacher's own groups only (every request is checked on the server). */
export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string>('');
  const [group, setGroup] = useState<string>(() => localStorage.getItem(GROUP_KEY) || '');
  const [tab, setTab] = useState<Tab>('inbox');
  const [correct, setCorrect] = useState<{ id: string; nl: string } | null>(null);

  useEffect(() => {
    if (!getKey()) return;
    call<Me>('me')
      .then((m) => {
        setMe(m);
        if (!m.groups.some((g) => g.code === group) && m.groups[0]) setGroup(m.groups[0].code);
      })
      .catch((e: ApiError) => setError(e.code === 'unauthorized' ? 'unauthorized' : e.message));
  }, []);
  useEffect(() => {
    if (group) localStorage.setItem(GROUP_KEY, group);
  }, [group]);

  if (!getKey() || error === 'unauthorized') {
    return (
      <main class="narrow">
        <h1>SpeesRep – docent</h1>
        {error === 'unauthorized' ? (
          <p class="error">Deze link werkt niet (meer). Vraag een nieuwe uitnodiging.</p>
        ) : (
          <p>Open deze pagina met de persoonlijke link uit je uitnodiging. Behandel die link als een sleutel: deel hem niet.</p>
        )}
        {error === 'unauthorized' && (
          <button
            class="btn"
            onClick={() => {
              forgetKey();
              location.reload();
            }}
          >
            Sleutel vergeten
          </button>
        )}
      </main>
    );
  }
  if (error) return <main class="narrow"><p class="error">{error}</p></main>;
  if (!me) return <main class="narrow"><p class="muted">Laden…</p></main>;
  if (!me.groups.length) return <main class="narrow"><h1>SpeesRep – docent</h1><p>Je hebt nog geen groep. Vraag de beheerder om een groep.</p></main>;
  const current = me.groups.find((g) => g.code === group) ?? me.groups[0];

  return (
    <div class="docent">
      <header class="top">
        <h1>
          SpeesRep – docent {__DOCENT_ENV__ === 'DEV' && <span class="badge">DEV</span>}
        </h1>
        <div class="who">
          <span class="muted">{me.label}</span>
          {me.groups.length > 1 ? (
            <select value={current.code} onChange={(e) => setGroup((e.target as HTMLSelectElement).value)} aria-label="Groep">
              {me.groups.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.display_name} ({g.code})
                </option>
              ))}
            </select>
          ) : (
            <strong>{current.display_name}</strong>
          )}
        </div>
      </header>
      <nav class="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>
      <main key={current.code + tab}>
        {tab === 'inbox' && <Inbox group={current} onCorrect={(c) => { setCorrect(c); setTab('propose'); }} />}
        {tab === 'cards' && <GroupCards group={current} onCorrect={(c) => { setCorrect(c); setTab('propose'); }} />}
        {tab === 'curriculum' && <Curriculum group={current} />}
        {tab === 'share' && <Share group={current} />}
        {tab === 'publish' && <Publish group={current} />}
        {tab === 'propose' && <Propose group={current} correction={correct} onDone={() => setCorrect(null)} />}
      </main>
      <footer class="muted small">
        Je ziet alleen je eigen groepen. Leerlingen sturen niets: hun voortgang staat alleen op hun telefoon.
      </footer>
    </div>
  );
}
