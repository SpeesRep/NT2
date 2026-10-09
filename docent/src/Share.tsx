import { useEffect, useState } from 'preact/hooks';
import qrcode from 'qrcode-generator';
import { call, type Group } from './api';

type Join = { code: string; link: string; page: string };

/** A QR code as SVG (drawn here: no outside service). */
function Qr({ text }: { text: string }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4},${r + 4}h1v1h-1z`;
  return (
    <svg class="qr" viewBox={`0 0 ${n + 8} ${n + 8}`} role="img" aria-label={`QR-code: ${text}`}>
      <rect width={n + 8} height={n + 8} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/** How students join: the group page (best on an iPhone: it keeps the group after "Zet op beginscherm"). */
export function Share({ group }: { group: Group }) {
  const [j, setJ] = useState<Join | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => void call<Join>('joinInfo', { group: group.code }).then(setJ).catch((e) => setMsg(e.message)), []);
  if (!j) return <p class="muted">{msg || 'Laden…'}</p>;
  const page = new URL(j.page, location.origin).href;
  return (
    <section class="share">
      <h2>Leerlingen uitnodigen</h2>
      <div class="share-grid">
        <div>
          <Qr text={page} />
          <p class="center"><strong>{group.display_name}</strong></p>
        </div>
        <div>
          <ol>
            <li>Leerlingen scannen de QR-code of openen de link.</li>
            <li>iPhone: Safari › Delen › <em>Zet op beginscherm</em>. Android: Chrome › ⋮ › <em>App installeren</em>.</li>
            <li>Ze kiezen hun hulptaal. Daarna werkt de app ook zonder internet.</li>
          </ol>
          <p>Link: <a href={page}>{page}</a></p>
          <p>Of typen in de app: <code class="code">{j.code}</code></p>
          <p class="muted small">De leerlingen hebben geen account. Hun voortgang blijft op hun telefoon; jij ziet die niet.</p>
          <button class="btn noprint" onClick={() => window.print()}>Afdrukken</button>
        </div>
      </div>
    </section>
  );
}
