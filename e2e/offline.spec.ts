import { expect, test, type Page, type Route } from '@playwright/test';

// A fake Apps Script: the app build points at https://mock.speesrep.test/exec (see `npm run e2e`).
const API = 'https://mock.speesrep.test/exec';

type Event = { event_id: string; card_id: string; rating: number };

function mockServer(
  settings: Record<string, unknown> = { new_per_day: 5, show_french_help: true },
  extraCards: Record<string, unknown>[] = []
) {
  const log = new Map<string, Event>();
  let posts = 0;
  let loseNextReply = false;
  const cards = ['huis', 'tafel', 'stoel', 'raam', 'boek'].map((nl, i) => ({
    id: `c_${i}`, type: 'word', nl, article: 'de', pos: 'noun', fr: `fr-${nl}`, example_nl: '', example_fr: '',
    tags: i < 2 ? ['huishouden'] : ['reizen'], flags: [], added: '2026-09-27', active: true
  }));
  cards.unshift(...(extraCards as typeof cards));
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

  return {
    log,
    posts: () => posts,
    loseNextReply: () => (loseNextReply = true),
    async install(page: Page) {
      await page.context().route(`${API}**`, async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (req.method() === 'GET') {
          const action = url.searchParams.get('action');
          if (action === 'ping') return json(route, { ok: true, env: 'DEV' });
          if (action === 'state') return json(route, { ok: true, progress: [] });
          return json(route, {
            ok: true, env: 'DEV', serverTime: new Date().toISOString(), cards,
            settings,
            tags: [
              { tag: 'huishouden', label_nl: 'huishouden', label_fr: 'la maison' },
              { tag: 'reizen', label_nl: 'reizen', label_fr: 'voyages' },
              { tag: 'emoji', label_nl: 'emoji', label_fr: 'emoji', subject_nl: 'Wat is dit?' }
            ],
            curriculum: ['emoji', 'huishouden', 'reizen'].map((tag, i) => ({ order: i + 1, tag, rule: 'always', date: '', percentage: null, from_tags: [] }))
          });
        }
        posts++;
        const body = JSON.parse(req.postData() || '{}');
        const accepted: string[] = [];
        const duplicate: string[] = [];
        for (const e of body.events as Event[]) {
          if (log.has(e.event_id)) duplicate.push(e.event_id);
          else {
            log.set(e.event_id, e);
            accepted.push(e.event_id);
          }
        }
        if (loseNextReply) {
          loseNextReply = false; // stored, but the phone never hears back (Google error page)
          return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<html>oops</html>' });
        }
        return json(route, { ok: true, accepted, duplicate, rejected: [] });
      });
    }
  };
}

/** The sync status lives in the menu: open it, run the checks, close it. */
async function inMenu(page: Page, check: () => Promise<void>) {
  await page.getByRole('button', { name: 'Menu openen' }).click();
  await check();
  await page.getByRole('menu').getByRole('button', { name: 'Sluiten' }).click();
}
const waitSynced = (page: Page) =>
  inMenu(page, () => expect(page.getByText('Laatst gesynchroniseerd: zojuist')).toBeVisible({ timeout: 20_000 }));

/** Rates n cards 😎 Makkelijk (days away: each one leaves today's queue). */
async function rateEasy(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.getByRole('button', { name: 'Antwoord tonen' }).click();
    const overlay = page.getByRole('dialog', { name: 'De vier knoppen' });
    if (await overlay.isVisible()) await overlay.getByRole('button', { name: 'Klaar' }).click();
    await page.getByRole('button', { name: /^Makkelijk, / }).click();
  }
}

async function reviewCards(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.getByRole('button', { name: 'Antwoord tonen' }).click();
    const overlay = page.getByRole('dialog', { name: 'De vier knoppen' });
    if (await overlay.isVisible()) await overlay.getByRole('button', { name: 'Klaar' }).click();
    await page.getByRole('button', { name: /^Goed, / }).click();
  }
}

test('offline: review without internet, reconnect, every review reaches the server exactly once', async ({ page, context }) => {
  const server = mockServer();
  await server.install(page);

  // 1. First launch online: cards are downloaded and the service worker caches the app.
  await page.goto('/NT2/dev/');
  await inMenu(page, async () => {
    await expect(page.getByText('Laatst gesynchroniseerd: zojuist')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('· 5 kaarten')).toBeVisible();
  });
  await page.evaluate(() => navigator.serviceWorker.ready);

  // 2. No internet, and the app is reopened: it still loads, with the cards.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Geen internet').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Starten' })).toBeEnabled();

  // 3. Review 3 cards offline.
  await page.getByRole('button', { name: 'Starten' }).click();
  await reviewCards(page, 3);
  await page.getByRole('button', { name: /Terug/ }).click();
  // Unsent answers: the red dot on the menu title; the menu shows them (it stays open while the connection comes back).
  await expect(page.locator('.menu-dot')).toBeVisible();
  await page.getByRole('button', { name: 'Menu openen' }).click();
  await expect(page.getByText('3 antwoorden nog niet gesynchroniseerd')).toBeVisible();
  expect(server.log.size).toBe(0);

  // 4. Internet is back: the queue is pushed, and the first reply gets lost on the way.
  server.loseNextReply();
  await context.setOffline(false);
  await expect(page.getByText('3 antwoorden nog niet gesynchroniseerd')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText('Laatst gesynchroniseerd: zojuist')).toBeVisible();

  // The resend after the lost reply was de-duplicated: 3 reviews, each exactly once.
  expect(server.posts()).toBeGreaterThanOrEqual(2);
  expect(server.log.size).toBe(3);
  expect([...server.log.values()].every((e) => e.rating === 3)).toBe(true);

  // 5. Another sync (the button in the menu) sends nothing new.
  await page.getByRole('button', { name: 'Synchroniseren' }).click();
  await expect(page.getByText('Laatst gesynchroniseerd: zojuist')).toBeVisible();
  expect(server.log.size).toBe(3);
  await page.getByRole('menu').getByRole('button', { name: 'Sluiten' }).click();
  await expect(page.locator('.menu-dot')).toBeHidden(); // everything sent, no 🚩 → no dot

  // 6. Reviews and progress survive a restart.
  await page.reload();
  const stored = await page.evaluate(
    () =>
      new Promise<{ progress: number; queue: number }>((res) => {
        const r = indexedDB.open('speesrep-dev');
        r.onsuccess = () => {
          const tx = r.result.transaction(['progress', 'queue']);
          const p = tx.objectStore('progress').count();
          const q = tx.objectStore('queue').count();
          tx.oncomplete = () => res({ progress: p.result, queue: q.result });
        };
      })
  );
  expect(stored).toEqual({ progress: 3, queue: 0 });
});

test("topics, the Vandaag bar, stop and resume, and Klaar voor nu (no sessions, no timers)", async ({ page }) => {
  // unlock_prod_stability_days high: a Makkelijk word does not open its FR→NL side today (keeps the numbers simple).
  const server = mockServer({ new_per_day: 5, unlock_prod_stability_days: 365, show_french_help: true });
  await server.install(page);
  await page.goto('/NT2/dev/');
  await waitSynced(page);

  // Kies een onderwerp: only "huishouden" → 2 new cards.
  await page.getByRole('button', { name: 'Onderwerp: alle' }).click();
  await page.getByRole('button', { name: /^huishouden/ }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();
  await expect(page.getByRole('button', { name: 'Onderwerp: huishouden' })).toBeVisible();
  await expect(page.locator('.stat').nth(1)).toContainText('2');
  await page.getByRole('button', { name: 'Onderwerp: huishouden' }).click();
  await page.getByRole('button', { name: 'Alle onderwerpen' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();

  // Home: "Vandaag" bar with what is left today (5 new cards).
  await expect(page.getByText('Vandaag', { exact: true })).toBeVisible();
  await expect(page.getByText('Nog 5 kaarten')).toBeVisible();

  // The review screen shows only the card: no progress bar, no "X van Y", no timer, no Stoppen.
  await page.getByRole('button', { name: 'Starten' }).click();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByText(/ van \d+ kaarten|minuut|minuten|Stoppen/)).toHaveCount(0);
  await rateEasy(page, 2);
  await page.getByRole('button', { name: /Terug/ }).click();
  await expect(page.getByText('Nog 3 kaarten')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');

  // Closing and reopening the app the same day resumes the same bar.
  await page.reload();
  await expect(page.getByText('Nog 3 kaarten')).toBeVisible();

  // Finish the rest: back home on its own, "Klaar voor nu!" instead of Starten.
  await page.getByRole('button', { name: 'Starten' }).click();
  await rateEasy(page, 3);
  await expect(page.getByText('Klaar voor nu!')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Starten' })).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
});

test('enkel/emoji card, 🔊 without a Dutch voice, and 🚩 flags (flag, note, list, copy, resolve)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const emoji = {
    id: 'E-01', type: 'oneway', nl: '🛏️', article: '', pos: 'emoji', fr: '', example_nl: '', example_fr: '', tags: ['emoji'],
    flags: [], answer: 'het bed', added: '2026-09-01', active: true
  };
  const server = mockServer({ new_per_day: 5, show_french_help: true }, [emoji]);
  await server.install(page);
  // Simulate a phone without a Dutch voice (the test machine may have one): hide every nl-* voice.
  await page.addInitScript(() => {
    if (!('speechSynthesis' in window)) return;
    const orig = speechSynthesis.getVoices.bind(speechSynthesis);
    speechSynthesis.getVoices = () => orig().filter((v) => !/^nl/i.test(v.lang));
  });
  await page.goto('/NT2/dev/');
  await waitSynced(page);

  // The oldest card comes first: the emoji card, with its subject label; the answer only after the reveal.
  await page.getByRole('button', { name: 'Starten' }).click();
  await expect(page.getByText('Wat is dit?')).toBeVisible();
  // The emoji is shown as the self-hosted OpenMoji picture (same origin, loaded, precached for offline use).
  const pic = page.getByRole('img', { name: '🛏️' });
  await expect(pic).toBeVisible();
  expect(await pic.getAttribute('src')).toBe('/NT2/dev/openmoji/1F6CF.svg');
  expect(await pic.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // Precached for offline use (in a fresh browser the service worker may still be installing: wait for it).
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(async () => !!(await caches.match('/NT2/dev/openmoji/1F6CF.svg', { ignoreSearch: true }))), { timeout: 15_000 })
    .toBe(true);
  await expect(page.getByText('het bed')).toBeHidden();
  await page.getByRole('button', { name: 'Antwoord tonen' }).click();
  const overlay = page.getByRole('dialog', { name: 'De vier knoppen' });
  await expect(overlay).toBeVisible(); // first session in a fresh browser: the one-time French overlay
  await overlay.getByRole('button', { name: 'Klaar' }).click();
  await expect(page.getByText('het bed')).toBeVisible();

  // 🔊 on a phone/browser without a Dutch voice → clear message.
  await page.getByRole('button', { name: 'Luisteren' }).first().click();
  await expect(page.getByText('Geen Nederlandse stem op deze telefoon.')).toBeVisible();

  // 🚩 flag this card with a note; the review goes on.
  // Marked 3 times (it happens): still ONE card in the list and in the count.
  await page.getByRole('button', { name: 'Kaart markeren' }).click();
  await page.getByRole('button', { name: 'Kaart markeren' }).click();
  await page.getByRole('button', { name: 'Kaart markeren' }).click();
  await expect(page.getByText('Gemarkeerd', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ notitie' }).click();
  await page.getByPlaceholder('Notitie (mag leeg)').fill('waarom geen emoji?');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await page.getByRole('button', { name: /^Makkelijk, / }).click();
  await page.getByRole('button', { name: /Terug/ }).click();

  // Menu (tap "SpeesRep") → Gemarkeerd → copy text → Opgelost.
  await page.getByRole('button', { name: 'Menu openen' }).click();
  await expect(page.getByRole('menuitem', { name: /Gemarkeerd/ })).toContainText('1');
  await page.getByRole('menuitem', { name: /Gemarkeerd/ }).click();
  await expect(page.getByText('🛏️ (het bed)')).toBeVisible();
  await expect(page.locator('.mark-item')).toHaveCount(1);
  await expect(page.locator('.mark-times')).toHaveText(' 3×');
  await expect(page.getByText('“waarom geen emoji?”')).toBeVisible();
  await page.getByRole('button', { name: 'Kopieer naar klembord' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('SpeesRep: gemarkeerde kaarten');
  expect(copied).toContain('🛏️ (het bed) · waarom geen emoji?');
  await page.getByRole('button', { name: 'Opgelost' }).click();
  await expect(page.getByText('Opgelost (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Klaar' }).click();
  await page.getByRole('button', { name: 'Menu openen' }).click();
  await expect(page.getByRole('menuitem', { name: /Gemarkeerd/ })).toHaveText(/^🚩 Gemarkeerd$/);
});

