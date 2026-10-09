import { expect, test, type Route } from '@playwright/test';

// The teacher page /docent/ against a mocked Apps Script API (no Google). Checks: the key leaves the address bar,
// only the teacher's groups, accept/hide, curriculum conflict, QR code, CSP limited to this site + the API.
const ORIGIN = 'http://localhost:4174';
const KEY = 'K'.repeat(32);
const GROUP = { code: 'abcd2345', display_name: 'Groep Zon', languages: ['fr', 'en'] };
const card = (id: string, nl: string) => ({
  id, type: 'word', nl, article: 'de', pos: 'noun', example_nl: '', answer: '', tags: ['huishouden'], flags: [], added: '2026-10-01',
  translations: { fr: { text: `fr-${nl}`, example: '' }, en: { text: `en-${nl}`, example: '' } }
});

test('teacher page: key login, inbox, curriculum with a colleague conflict, invite QR', async ({ page }) => {
  const calls: { action: string; key: string; body: Record<string, unknown> }[] = [];
  const csp: string[] = [];
  page.on('console', (m) => /Content Security Policy/i.test(m.text()) && csp.push(m.text()));
  let saves = 0;
  await page.route('https://script.google.com/**', async (route: Route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push({ action: body.action, key: body.key, body });
    const ok = (o: Record<string, unknown>) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, ...o }) });
    switch (body.action) {
      case 'me': return ok({ label: 'Docent A', groups: [GROUP] });
      case 'inbox': return ok({ group: GROUP, cards: [card('c_1', 'huis'), card('c_2', 'tafel')] });
      case 'reviewCards': return ok({ done: body.decisions.map((d: { card_id: string }) => d.card_id), refused: [] });
      case 'getCurriculum':
        return ok({ group: GROUP, version: 1, known: {}, topics: [{ tag: 'huishouden', label: 'Het huis', cards: 2, bank: 2 }, { tag: 'reizen', label: 'Reizen', cards: 0, bank: 5 }],
          rows: [{ order: 1, tag: 'huishouden', rule: 'always', date: '', percentage: null, from_tags: [] }] });
      case 'saveCurriculum':
        saves++;
        return saves === 1 ? ok({ saved: false, conflict: true, version: 2 }) : ok({ saved: true, version: 2, checks: [] });
      case 'joinInfo': return ok({ group: GROUP, code: GROUP.code, link: `/NT2/dev/?groep=${GROUP.code}`, page: `/NT2/dev/g/${GROUP.code}/` });
      default: return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: 'forbidden', message: 'nope' }) });
    }
  });
  const requests: string[] = [];
  page.on('request', (r) => requests.push(new URL(r.url()).origin));

  await page.goto(`/NT2/dev/docent/#key=${KEY}`);
  await expect(page.getByText('Docent A')).toBeVisible();
  expect(page.url()).not.toContain('#key'); // the key left the address bar
  expect(calls[0]).toMatchObject({ action: 'me', key: KEY });

  // Inbox: both translations, accept one, accept the rest.
  await expect(page.getByText('fr-huis')).toBeVisible();
  await expect(page.getByText('en-huis')).toBeVisible();
  await page.getByRole('button', { name: 'Accepteren', exact: true }).first().click();
  await expect(page.getByText('1 geaccepteerd')).toBeVisible();
  expect(calls.find((c) => c.action === 'reviewCards')?.body).toMatchObject({ group: GROUP.code, decisions: [{ card_id: 'c_1', status: 'accepted' }] });

  // Curriculum: add a topic, save → a colleague saved first → nothing overwritten; save again works.
  await page.getByRole('tab', { name: 'Curriculum' }).click();
  await page.getByLabel('Onderwerp toevoegen').selectOption('reizen');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByText('Een collega heeft dit intussen veranderd')).toBeVisible();
  expect(calls.filter((c) => c.action === 'saveCurriculum')[0].body).toMatchObject({ version: 1, group: GROUP.code });
  await page.getByRole('button', { name: 'Opnieuw laden' }).click();
  await page.getByLabel('Onderwerp toevoegen').selectOption('reizen');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByText('Opgeslagen.')).toBeVisible();

  // Invite: QR code (drawn on the page) + the group page link.
  await page.getByRole('tab', { name: 'Leerlingen uitnodigen' }).click();
  await expect(page.getByRole('img', { name: /QR-code: http:\/\/localhost:4174\/NT2\/dev\/g\/abcd2345\// })).toBeVisible();
  await expect(page.getByText(GROUP.code, { exact: true })).toBeVisible();

  // Every call carried the key in the body; only this site and the API were contacted; no CSP violations.
  expect(calls.every((c) => c.key === KEY)).toBe(true);
  expect([...new Set(requests)].sort()).toEqual([ORIGIN, 'https://script.google.com'].sort());
  expect(csp).toEqual([]);
});

test('teacher page without a key, or with a revoked key', async ({ page }) => {
  await page.goto('/NT2/dev/docent/');
  await expect(page.getByText('Open deze pagina met de persoonlijke link')).toBeVisible();
  await page.route('https://script.google.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: 'unauthorized', message: 'x' }) }));
  await page.goto(`/NT2/dev/docent/#key=${'Z'.repeat(32)}`);
  await expect(page.getByText('Deze link werkt niet (meer)')).toBeVisible();
});
