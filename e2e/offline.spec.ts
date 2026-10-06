import { expect, test, type Page, type Route } from '@playwright/test';

// The app's only network use: content.json from its own origin (published by the content Action).
const ORIGIN = 'http://localhost:4174';
const CONTENT = `${ORIGIN}/NT2/dev/content.json`;

function mockServer(
  settings: Record<string, unknown> = { new_per_day: 5, show_french_help: true },
  extraCards: Record<string, unknown>[] = []
) {
  let version = 1;
  let fetches = 0;
  const cards = ['huis', 'tafel', 'stoel', 'raam', 'boek'].map((nl, i) => ({
    id: `c_${i}`, type: 'word', nl, article: 'de', pos: 'noun', fr: `fr-${nl}`, example_nl: '', example_fr: '',
    tags: i < 2 ? ['huishouden'] : ['reizen'], flags: [], added: '2026-09-27', active: true
  }));
  cards.unshift(...(extraCards as typeof cards));
  /** Every request the page or its service worker makes (method + URL). */
  const requests: { method: string; url: string }[] = [];

  return {
    fetches: () => fetches,
    requests,
    /** A new word list is published (new version). */
    publish(card: (typeof cards)[number]) {
      cards.push(card);
      version++;
    },
    async install(page: Page) {
      page.context().on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
      await page.context().route(CONTENT, async (route: Route) => {
        fetches++;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            format: 1, version: `v${version}`, env: 'DEV', generated_at: new Date().toISOString(), cards, settings,
            tags: [
              { tag: 'huishouden', label_nl: 'huishouden', label_fr: 'la maison' },
              { tag: 'reizen', label_nl: 'reizen', label_fr: 'voyages' },
              { tag: 'emoji', label_nl: 'emoji', label_fr: 'emoji', subject_nl: 'Wat is dit?' }
            ],
            curriculum: ['emoji', 'huishouden', 'reizen'].map((tag, i) => ({ order: i + 1, tag, rule: 'always', date: '', percentage: null, from_tags: [] }))
          })
        });
      });
    }
  };
}

/** Fails the test on any Content-Security-Policy violation. */
function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  return violations;
}

/** The word-list status lives in the menu: open it, run the checks, close it. */
async function inMenu(page: Page, check: () => Promise<void>) {
  await page.getByRole('button', { name: 'Menu openen' }).click();
  await check();
  await page.getByRole('menu').getByRole('button', { name: 'Sluiten' }).click();
}
const waitSynced = (page: Page) =>
  inMenu(page, () => expect(page.getByText('Bijgewerkt: zojuist')).toBeVisible({ timeout: 20_000 }));

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

test('offline: review without internet, nothing is ever sent, a new word list arrives in the background', async ({ page, context }) => {
  const server = mockServer();
  const csp = watchCsp(page);
  await server.install(page);

  // 1. First launch online: content.json is downloaded and the service worker caches the app.
  await page.goto('/NT2/dev/');
  await inMenu(page, async () => {
    await expect(page.getByText('Bijgewerkt: zojuist')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('· 5 kaarten')).toBeVisible();
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(server.fetches()).toBeGreaterThanOrEqual(1);

  // 2. No internet, and the app is reopened: it still loads, with the cards.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Geen internet').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Starten' })).toBeEnabled();

  // 3. Review 3 cards offline. Nothing waits to be sent: no red dot on the menu.
  await page.getByRole('button', { name: 'Starten' }).click();
  await reviewCards(page, 3);
  await page.getByRole('button', { name: /Terug/ }).click();
  await expect(page.locator('.menu-dot')).toBeHidden();

  // 4. A new word list is published; internet comes back: the app picks it up by itself.
  server.publish({
    id: 'c_new', type: 'word', nl: 'deur', article: 'de', pos: 'noun', fr: 'la porte', example_nl: '', example_fr: '',
    tags: ['huishouden'], flags: [], added: '2026-09-28', active: true
  });
  await context.setOffline(false);
  await inMenu(page, () => expect(page.getByText('· 6 kaarten')).toBeVisible({ timeout: 20_000 }));

  // 5. "Bijwerken" with the same version keeps the cards and the progress.
  await page.getByRole('button', { name: 'Menu openen' }).click();
  await page.getByRole('button', { name: 'Bijwerken' }).click();
  await expect(page.getByText('Bijgewerkt: zojuist')).toBeVisible();
  await page.getByRole('menu').getByRole('button', { name: 'Sluiten' }).click();

  // 6. Progress survives a restart; the old outbox stays empty.
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

  // No data collection: only GET requests, all to the app's own origin.
  expect(server.requests.length).toBeGreaterThan(0);
  expect(server.requests.filter((r) => !r.url.startsWith(ORIGIN) || r.method !== 'GET')).toEqual([]);
  expect(csp).toEqual([]);
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

