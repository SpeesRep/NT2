import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';

// The app's only network use: its group's content.json from its own origin (built by the deploy).
const ORIGIN = 'http://localhost:4174';
const CODE = 'abcd2345'; // a group code (8 characters of the code alphabet)
const groupFile = (code: string) => `${ORIGIN}/NT2/dev/g/${code}/content.json`;

/** A word card with French and English help texts. */
const word = (id: string, nl: string, tags: string[]) => ({
  id, type: 'word', nl, article: 'de', pos: 'noun', example_nl: '', tags, flags: [], added: '2026-09-27', active: true,
  translations: { fr: { text: `fr-${nl}`, example: '' }, en: { text: `en-${nl}`, example: '' } }
});

function mockServer(
  settings: Record<string, unknown> = { new_per_day: 5, show_french_help: true },
  extraCards: Record<string, unknown>[] = []
) {
  let version = 1;
  let fetches = 0;
  let active = true;
  const cards: Record<string, unknown>[] = ['huis', 'tafel', 'stoel', 'raam', 'boek'].map((nl, i) => word(`c_${i}`, nl, i < 2 ? ['huishouden'] : ['reizen']));
  cards.unshift(...extraCards);
  /** Every request the page or its service worker makes (method + URL). */
  const requests: { method: string; url: string }[] = [];

  return {
    fetches: () => fetches,
    requests,
    /** A new word list is published (new version). */
    publish(card: Record<string, unknown>) {
      cards.push(card);
      version++;
    },
    /** The owner deactivates the group: its file becomes a stub. */
    stop() {
      active = false;
    },
    async install(page: Page) {
      page.context().on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
      // Any other code: 404, like GitHub Pages.
      await page.context().route(`${ORIGIN}/NT2/dev/g/**`, (route: Route) => route.fulfill({ status: 404, body: 'not found' }));
      await page.context().route(groupFile(CODE), async (route: Route) => {
        fetches++;
        const body = active
          ? {
              format: 1, code: CODE, active: true, version: `v${version}`, env: 'DEV', display_name: 'Groep Zon', languages: ['fr', 'en'],
              cards, settings,
              tags: [
                { tag: 'huishouden', label_nl: 'huishouden', labels: { fr: 'la maison', en: 'home' } },
                { tag: 'reizen', label_nl: 'reizen', labels: { fr: 'voyages', en: 'travel' } },
                { tag: 'emoji', label_nl: 'emoji', subject_nl: 'Wat is dit?', labels: {} }
              ],
              curriculum: ['emoji', 'huishouden', 'reizen'].map((tag, i) => ({ order: i + 1, tag, rule: 'always', date: '', percentage: null, from_tags: [] }))
            }
          : { format: 1, code: CODE, active: false };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
    }
  };
}

/** Opens the app through the group's join link and picks a help language (French by default). */
async function joinGroup(page: Page, language = 'Français') {
  await page.goto(`/NT2/dev/?groep=${CODE}`);
  await page.getByRole('button', { name: language }).click();
  await expect(page.getByRole('button', { name: 'Starten' }).or(page.getByText('Klaar voor nu!'))).toBeVisible({ timeout: 20_000 });
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
  await joinGroup(page);
  await expect(page).toHaveURL(/\/NT2\/dev\/$/); // the code left the address bar
  await inMenu(page, async () => {
    await expect(page.getByText('Bijgewerkt: zojuist')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Groep: Groep Zon')).toBeVisible();
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
  server.publish({ ...word('c_new', 'deur', ['huishouden']), added: '2026-09-28' });
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
  await joinGroup(page);
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
    id: 'E-01', type: 'oneway', nl: '🛏️', article: '', pos: 'emoji', example_nl: '', translations: {}, tags: ['emoji'],
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
  await joinGroup(page);
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


test('backup: save as a file, restore on a fresh device, ask before replacing newer progress here', async ({ page, context }, info) => {
  const server = mockServer({ new_per_day: 5, unlock_prod_stability_days: 365, show_french_help: true });
  const csp = watchCsp(page);
  await server.install(page);
  await joinGroup(page);
  await waitSynced(page);
  const openSettings = async () => {
    await page.getByRole('button', { name: 'Menu openen' }).click();
    await page.getByRole('menuitem', { name: /Instellingen/ }).click();
  };
  const lastReviews = () =>
    page.evaluate(
      () =>
        new Promise<string[]>((res) => {
          const r = indexedDB.open('speesrep-dev');
          r.onsuccess = () => {
            const q = r.result.transaction('progress').objectStore('progress').getAll();
            q.onsuccess = () => res(q.result.map((p: { last_review: string }) => p.last_review));
          };
        })
    );
  const toastGone = () => expect(page.locator('.toast')).toHaveCount(0, { timeout: 10_000 });
  const progressCount = () =>
    page.evaluate(
      () =>
        new Promise<number>((res) => {
          const r = indexedDB.open('speesrep-dev');
          r.onsuccess = () => {
            const q = r.result.transaction('progress').objectStore('progress').count();
            q.onsuccess = () => res(q.result);
          };
        })
    );

  // 1. Rate 2 cards, save a backup (no share sheet in this browser → a download).
  await page.getByRole('button', { name: 'Starten' }).click();
  await rateEasy(page, 2);
  await page.getByRole('button', { name: /Terug/ }).click();
  await openSettings();
  await expect(page.getByText(/Je voortgang staat alleen op dit toestel|de browser kan je voortgang wissen/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back-up opslaan' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^speesrep-dev-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = info.outputPath('backup.json');
  await download.saveAs(file);

  // 2. Restoring onto the same progress changes nothing and needs no question.
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByText('Back-up teruggezet: 0 kaarten.')).toBeVisible();
  await toastGone();

  // 3. A fresh device: the backup brings the 2 cards back, without a question (nothing to replace).
  // (deleted from a same-origin page that is not the app, so no open connection blocks it)
  await page.goto('/NT2/dev/manifest.webmanifest');
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.deleteDatabase('speesrep-dev');
    r.onsuccess = r.onerror = r.onblocked = () => res(null);
  }));
  await joinGroup(page);
  await waitSynced(page);
  expect(await progressCount()).toBe(0);
  await openSettings();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByText('Back-up teruggezet: 2 kaarten.')).toBeVisible();
  expect(await progressCount()).toBe(2);
  await toastGone();

  // 4. A backup that is NEWER than this device: the app asks first; Annuleren keeps everything as it is.
  const newer = JSON.parse(readFileSync(file, 'utf8'));
  for (const p of newer.progress) p.last_review = '2099-01-01T00:00:00.000Z';
  const newerFile = info.outputPath('newer.json');
  writeFileSync(newerFile, JSON.stringify(newer));
  await page.locator('input[type=file]').setInputFiles(newerFile);
  const ask = page.getByRole('alertdialog', { name: 'Back-up terugzetten?' });
  await expect(ask).toContainText('vervangt je voortgang van 2 kaarten');
  await ask.getByRole('button', { name: 'Annuleren' }).click();
  await expect(ask).toBeHidden();
  expect((await lastReviews()).some((t) => t.startsWith('2099'))).toBe(false);
  await page.locator('input[type=file]').setInputFiles(newerFile);
  await ask.getByRole('button', { name: 'Vervangen' }).click();
  await expect(page.getByText('Back-up teruggezet: 2 kaarten.')).toBeVisible();
  await expect.poll(lastReviews).toEqual(['2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z']);
  await toastGone();

  // 5. Not a backup: refused.
  const junk = info.outputPath('junk.json');
  writeFileSync(junk, '{"hello":1}');
  await page.locator('input[type=file]').setInputFiles(junk);
  await expect(page.getByText('Dit is geen SpeesRep-back-up.')).toBeVisible();
  expect(csp).toEqual([]);
});

test('group code, help language and a stopped group (no default group, nothing sent)', async ({ page, context }) => {
  const server = mockServer({ new_per_day: 5, unlock_prod_stability_days: 365, show_french_help: true });
  const csp = watchCsp(page);
  await server.install(page);

  // 1. First start without a code: the code screen, not a default list.
  await page.goto('/NT2/dev/');
  await expect(page.getByRole('heading', { name: 'Je groep' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Starten' })).toHaveCount(0);
  const input = page.getByLabel('Code van je groep');
  await input.fill('abc');
  await page.getByRole('button', { name: 'Verder' }).click();
  await expect(page.getByText('Een code heeft 8 letters en cijfers.')).toBeVisible();
  await input.fill('zzzz2222');
  await page.getByRole('button', { name: 'Verder' }).click();
  await expect(page.getByText('Deze code bestaat niet.')).toBeVisible();

  // 2. The right code, typed the way a student might (capitals, a space) → the help language.
  await input.fill(CODE.toUpperCase().slice(0, 4) + ' ' + CODE.slice(4));
  await page.getByRole('button', { name: 'Verder' }).click();
  await expect(page.getByRole('heading', { name: 'Je hulptaal' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();

  // 3. Cards and help in English, with lang + dir="auto".
  await page.getByRole('button', { name: 'Hulp' }).click();
  await expect(page.getByRole('dialog').locator('p[lang="en"][dir="auto"]')).toContainText('Tap “SpeesRep” at the top for the menu');
  await page.getByRole('dialog').getByRole('button').last().click();
  await page.getByRole('button', { name: 'Starten' }).click();
  const overlay = page.getByRole('dialog', { name: 'De vier knoppen' });
  await page.getByRole('button', { name: 'Antwoord tonen' }).click();
  if (await overlay.isVisible()) {
    await expect(overlay).toContainText('I didn’t know');
    await overlay.getByRole('button', { name: 'Klaar' }).click();
  }
  await expect(page.locator('.card-answer[lang="en"][dir="auto"]')).toHaveText(/^en-/);
  await page.getByRole('button', { name: /Terug/ }).click();

  // 4. Switching the help language works offline (all languages are on the device).
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Menu openen' }).click();
  await page.getByRole('menuitem', { name: /Instellingen/ }).click();
  await page.getByLabel('Hulptaal').selectOption('fr');
  // On the Linux CI runner (mobile emulation), the pointer hit-test right after a <select> change lands on the
  // Back-up controls although the CI screenshot shows Klaar fully visible; tap the button directly.
  await page.getByRole('button', { name: 'Klaar' }).dispatchEvent('click');
  await page.getByRole('button', { name: 'Starten' }).click();
  await page.getByRole('button', { name: 'Antwoord tonen' }).click();
  await expect(page.locator('.card-answer[lang="fr"]')).toHaveText(/^fr-/);
  await page.getByRole('button', { name: /Terug/ }).click();
  await context.setOffline(false);

  // 5. The owner stops the group: the cards and progress stay, a short message appears.
  server.stop();
  await page.reload();
  await expect(page.getByText('Je groep is gestopt. Je kunt blijven oefenen.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Starten' }).or(page.getByText('Klaar voor nu!'))).toBeVisible();

  // Nothing was ever sent: only GETs to the app's own origin.
  expect(server.requests.filter((r) => !r.url.startsWith(ORIGIN) || r.method !== 'GET')).toEqual([]);
  expect(csp).toEqual([]);
});
