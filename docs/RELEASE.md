# Releasing: DEV → PROD

| | branch | Pages URL | Apps Script | Sheet |
|---|---|---|---|---|
| DEV  | `main`    | https://speesrep.github.io/NT2/dev/ | "Dutch DEV"  | "Dutch DEV"  |
| PROD | `release` | https://speesrep.github.io/NT2/     | "Dutch PROD" | "Dutch PROD" |

Teacher review page: DEV and PROD links in docs/SHEET.md › Teacher review page (PROD:
https://script.google.com/macros/s/AKfycbypjhtKIajEpMxdfqjjmEh0dINaUVlysplSX4A76Q2E6dE8zZbsV476lplSwn8d5b2z/exec?page=review).

Every push to `main` or `release` rebuilds **both** apps into one Pages artifact
(`.github/workflows/deploy.yml`).

## PROD safety checklist (every PROD change — the learner's progress must survive)

Applies to a `release` push, `npm run gas:deploy:prod`, `admin prod setup`, and any write to the PROD sheet.

1. **Back up first:** `npm run backup:prod` → `backups/prod-<time>.json` (Log, Progress, Cards; git-ignored —
   it is the learner's data). Note the counts it prints.
2. **Only additive / migration-safe changes:**
   - IndexedDB: bump the version and ADD stores/indexes in `upgrade(d, oldVersion)`; never delete or
     recreate an existing store (her progress and unsent reviews live there).
   - Sheet: new columns are inserted by `ensureHeaders_` (data moves with them); never rename a header,
     never delete Log or Progress rows (except `purgeSmoke` test rows).
   - Never change the `id` of a card she has studied (Progress/Log are keyed by card_id). Replacing cards is
     only OK for ids without Progress rows — check first.
3. **Order:** release the app first when the sheet starts sending something the old app can't show; the new
   app must handle both old and new sheet values.
4. **Dry run** anything that changes Cards (`replaceKlok`, migrations) and show the result before applying.
5. **Verify after:** `npm run smoke:prod` (cleans up its own rows), run `npm run backup:prod` again and
   compare: Log and Progress counts must be ≥ before (only her own new reviews may add rows). Open the live
   PROD app and check it shows the new build AND a feature of this release (the footer's build ID is the commit
   actually built; when `main` and `release` deploy close together, Pages can keep the older artifact — then run
   `gh workflow run deploy.yml --ref main`, which rebuilds both apps from their branches).
6. Never reset, reseed or test-review against PROD.
7. Anything that would break her progress (changing ids of studied cards, deleting Progress/Log rows, replacing
   studied cards) needs the teacher's explicit permission first. DEV progress does not matter.

## Device test pass (every stage, before "go PROD")

On DEV (https://speesrep.github.io/NT2/dev/):

- **iPhone** (Safari or Chrome): Share → "Zet op beginscherm", open from the icon, review a few cards,
  Airplane Mode → reopen → review → back online → the "nog niet gesynchroniseerd" line disappears.
- **Android** (one physical phone, Chrome):
  1. Open the link, rate at least 3 cards, then tap Terug. Back on home, "⬇ App installeren" appears
     → install → the icon (maskable, not cropped) is on the home screen; open it from there.
  2. Offline: Airplane Mode → reopen from the icon → review → back online → it syncs.
  3. Audio (once listening mode exists): a Dutch word is spoken; with no nl-NL/nl-BE voice installed
     (Settings → Text-to-speech) the "no Dutch voice" message appears instead.

## 1. Promote the web app

```bash
git checkout release
git merge --ff-only main
git push
git checkout main
```

If `--ff-only` fails, someone committed to `release` directly: merge `release` back into `main`
first, then retry. The learner sees "Nouvelle version disponible" the next time she opens the app.

## 2. Promote the Apps Script (only if `apps-script/` changed)

From the same commit that is on `release` (deploys BOTH the card API and the teacher review page, same URLs):

```bash
npm run gas:deploy:prod
npm run smoke:prod
```

`gas:deploy:prod` pushes the code and moves the **existing** deployment to a new version, so the
`/exec` URL never changes. It refuses to run if `apps-script/Secrets.gs` is not blank.

If a change adds a new tab, column or setting, also run setup on PROD:

```bash
npm run admin -- prod setup
```

## Rollback

- Web app: `git checkout release && git reset --hard <previous-sha> && git push --force-with-lease`.
- Apps Script: `clasp -P .clasp.prod.json deployments` to see versions, then
  `clasp -P .clasp.prod.json redeploy <deploymentId> -V <older version>`.

Reviews are never lost on rollback: they wait in the phone's queue and the server de-duplicates
by `event_id`.

## Rotating tokens (LEARNER / ADMIN)

Do it when a token may have leaked, or once in a while. Two tokens per environment, both random strings:
`LEARNER_TOKEN` (inside the public app: read cards/progress, append reviews) and `ADMIN_TOKEN` (only on this
computer: `scripts/admin.mjs`). They live in three places: `.env.local` (this computer, git-ignored), Script
Properties of the Apps Script project, and GitHub Actions secrets (`LEARNER_TOKEN_DEV|PROD`; the admin token is not
there). Never paste a token into chat, an issue or a commit.

1. Make a new value, e.g. `openssl rand -hex 24`, and put it in `.env.local` (`LEARNER_TOKEN_<ENV>` and/or
   `ADMIN_TOKEN_<ENV>`). Do DEV first and check it before PROD.
2. `scripts/push-secrets.sh <env>` → open the Apps Script editor, run `setup()` (it copies the values to Script
   Properties) → `npm run gas:push:<env>` (puts the blank `Secrets.gs` back) → `npm run gas:deploy:<env>`.
   From now on the old token is refused.
3. ADMIN only: done. Check with `npm run admin -- <env> listInbox`.
4. LEARNER: also update the GitHub secret (`gh secret set LEARNER_TOKEN_<ENV>`, paste the value when asked), then
   rebuild the site: DEV = push to `main` (or `gh workflow run deploy.yml --ref main`); PROD = the next `release`
   push (ask first) — the PROD site is built from `release`.
5. LEARNER on PROD — her phone: until it has the new app version, syncs fail (unauthorized). Nothing is lost: every
   rating stays in the phone's outbox until the server accepts it, and goes out after the update. Do it when she can
   open the app soon afterwards (the update banner), and check the Log tab for her next reviews.
6. `npm run smoke:<env>` and `npm run backup:prod` (PROD).
