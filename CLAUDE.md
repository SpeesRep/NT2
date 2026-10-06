# SpeesRep — offline-first Dutch flashcards (multi-user)

**SpeesRep** is the multi-user successor of Fanki (Inno-vis/fanki, which keeps running unchanged for its one
learner). Code copied from Fanki on 2026-10-06 without history; technical names are now `speesrep`
(IndexedDB `NS` `speesrep-prod`/`speesrep-dev`, Workbox cacheId, backup `app`) and the URLs `/NT2/`.

**Core rule: no data collection.** All progress stays on the device; the app only fetches the word list.
Work in progress (phases): 1 repo/rename/config ✓ · 2 static content.json ✓ · 3 progress export/import +
storage.persist · 4 multiple groups (design first). Sections below that still talk about syncing reviews to the
Sheet, Log/Progress or "her" are inherited from Fanki and outdated where they contradict this header.

## Content publishing (no data collection)

- The app's ONLY network use: `GET <base>content.json` from its own origin (`CONTENT_URL`, `syncNow` in src/sync.ts:
  on launch, when back online, on return to the foreground after > 2 min, and "Bijwerken" in the menu). It stores
  the list only when `version` changed (`meta.contentVersion`). Ratings stay in IndexedDB (`recordReview` writes no
  outbox event; the old `queue` store stays empty). No API client, no tokens in the app.
- CSP meta tag (production builds, `CSP` in vite.config.ts): everything `'self'`, `connect-src 'self'`. No external
  origins, no analytics. e2e asserts only same-origin GETs and no CSP violations.
- `.github/workflows/content.yml` (Actions → Publish content, or repository_dispatch `publish` with
  client_payload.env): `scripts/build-content.mjs <env>` calls the admin action `content` (POST, ADMIN_TOKEN_<ENV>
  secret) → validates (non-empty, env matches, card ids present/unique/never derived from the word: random
  `c_xxxxxxxxxx` or hand-made codes like `K-01`) → `{format:1, version (sha256 of the content), env, generated_at,
  cards, settings, tags, curriculum}` → commits `<env>/content.json` to the `content` branch only when the version
  changed → calls deploy.yml (workflow_call), which copies it to `/NT2/content.json` (PROD) and
  `/NT2/dev/content.json` (DEV). content.json is never precached by the service worker.
- "Publiceren" = a tile on the teacher Start page (apps-script/Publish.gs `reviewPublish`): POSTs the
  repository_dispatch with Script Property `GITHUB_DISPATCH_TOKEN` (fine-grained token, SpeesRep/NT2 only,
  Contents: Read and write). A sheet menu is impossible: the projects are standalone, not bound to the sheets.

Google account **speesrep@gmail.com** (never the Fanki account): sheets "Dutch DEV"/"Dutch PROD" (ids in
`sheets.json`), standalone Apps Script projects (`.clasp.dev.json`, `.clasp.prod.json`), web-app deployments in
`deploy.config.json`. clasp ALWAYS through `scripts/clasp.sh` (own login file `~/.config/speesrep/.clasprc.json`;
log in with `scripts/clasp.sh login`). GitHub: org **SpeesRep**, repo **SpeesRep/NT2** (public).
Script Properties (ENV, SHEET_ID, ADMIN_TOKEN, MIGRATED_NL, TEACHER_EMAILS) are set by the temporary
`scripts/setup-properties.sh <env>` (reads a git-ignored `secrets.tmp.env`; run `setupProperties()` once in the
editor; then `--remove`). No LEARNER_TOKEN: students never call Apps Script. GitHub secrets: `ADMIN_TOKEN_DEV|PROD`,
`API_URL_DEV|PROD`.

- DEV: https://speesrep.github.io/NT2/dev/ (branch `main`, sheet "Dutch DEV")
- PROD: https://speesrep.github.io/NT2/ (branch `release`, sheet "Dutch PROD")
- Release process: `docs/RELEASE.md`. Sheet schema: `docs/SHEET.md` (keep in sync with `apps-script/Schema.gs`).
  UI strings for review: `docs/UI-STRINGS.md`.

## Stack

- Vite + TypeScript + Preact, `idb` (IndexedDB), `ts-fsrs` (scheduling), `vite-plugin-pwa` (Workbox precache).
- Two builds from one codebase (`vite.config.ts`): `--mode prod` → `dist/` base `/NT2/`;
  `--mode dev` → `dist/dev/` base `/NT2/dev/`. Always build PROD first (it empties `dist/`).
  Separate manifest, scope, Workbox `cacheId`, IndexedDB namespace (`NS` in `src/config.ts`).
- `apps-script/`: one codebase for both Apps Script projects (`.clasp.dev.json`, `.clasp.prod.json`),
  deployment IDs in `deploy.config.json`.
- UI language: **Dutch (A1)** — short sentences, present tense, common words, no idioms. `<html lang="nl">`.
  Large touch targets, one-handed, dark mode, safe-area padding.

## Secrets — never commit, never print

- `.env.local` (git-ignored, optional): `ADMIN_TOKEN_{DEV,PROD}`, `API_URL_{DEV,PROD}` (no learner token in SpeesRep).
- `ADMIN_TOKEN` must **never** appear in the site, the repo, or chat output. Use `node scripts/admin.mjs`
  (reads it from `.env.local`, never prints it). Don't `cat .env.local` or echo tokens.
- `apps-script/Secrets.gs` is committed **blank**. Script Properties are set with `scripts/setup-properties.sh <env>`
  (temporary, git-ignored `apps-script/SetupProperties.js`; removed again with `--remove`, which verifies it is gone).
- Hooks in `.githooks/` (enabled by `npm install` → `core.hooksPath`) run `scripts/check-secrets.sh`
  before every commit and push; CI runs it on source (not `dist/`). Never bypass with `--no-verify`.
- CI gets `API_URL_*` (and, for the content Action, `ADMIN_TOKEN_*`) from GitHub Actions secrets.

## API (Apps Script web app, executeAs USER_DEPLOYING, access ANYONE_ANONYMOUS)

- HTTP is always 200. Body is `{ok:true,...}` or `{ok:false,error,message}`.
- `GET ?action=ping` · `?action=cards&token=` · `?action=state&token=`
- `POST` with a `text/plain` JSON body and **no custom headers** (avoids CORS preflight):
  `{action:"reviews", token, events:[{event_id, card_id, track, ts, rating, mode, duration_ms, snapshot}]}`
  → `{accepted, duplicate, rejected}`. Idempotent on `event_id`.
- Admin-only (ADMIN_TOKEN): `listCards, listUntagged, tags, setTags, appendInbox, listInbox,
  promoteInbox, rebuildProgress, setup, readTab, reseedDev (DEV only), purgeSmoke,
  setCurriculum, addCurriculum, curriculumStatus, migrateToDutch, userInfo, setTeachers, enableApproval, setCheck, removeTags, deleteRejected (DEV only), importCards, cardsToInbox, setSetting, cleanSettings, deleteTabs, splitInbox, splitCards, migrateCurriculum, deleteCards, updateCards, replaceTag, dropNakijken, dropTagsSource, replaceKlok, seedEmoji (dry run unless
  dryRun:false; seedEmoji is DEV only)`. Open items: docs/todo.md.
- All writes are inside `LockService`. All actions are idempotent, so clients **retry** on
  `no_action` (POST body lost on Google's redirect), `busy`, or non-JSON responses.
- Deploy with `npm run gas:deploy:<env>` — keeps the same deployment ID so the /exec URL never changes.
- Verify with `npm run smoke:<env>`.

## UI text (Dutch interface, French only as opt-in help)

- **Every** learner-facing string lives in `src/i18n.ts` as `{ nl, fr }`. Components call `t(key)`;
  never hard-code UI text in a component. `fr` is hidden help text.
- French appears only (a) in the "Hulp" panel (`?` button on every screen, `HELP[screen].fr`) when she
  taps it, and (b) in the one-time rating-buttons overlay. Both are hidden when Settings
  `show_french_help` is FALSE.
- Interface vocabulary is course content: the 50 "app" words (`APP_SEED_CARDS` in `apps-script/Schema.gs`,
  tag `app`, added 2026-09-27) are seeded in DEV **and** PROD. `npm run ui-vocab` warns about UI words
  that are neither taught nor on its function-word allowlist (CI: warning only).
- `docs/UI-STRINGS.md` is generated: `npm run ui-strings` after editing `src/i18n.ts`.
- Relative times in Dutch (`timeAgo` in `src/format.ts`): "zojuist", "5 minuten geleden", "2 dagen geleden".
- The tag filter ("Kies een onderwerp") shows Tags.`label_nl`; the keys in Cards.tags are unchanged.

## Teacher pages (Apps Script HtmlService: Start · Controleren · Curriculum)

- `apps-script/Teacher.gs` + `Review.html` (vanilla JS, no build). Served by a SECOND web-app deployment of the
  same project: `scripts/gas-deploy.sh` pushes a temporary manifest variant (executeAs USER_ACCESSING, access
  ANYONE or `teacherAccess` from deploy.config.json, + userinfo.email scope), versions it, redeploys
  `teacherDeploymentId`, then pushes the repo manifest and redeploys the anonymous API (HEAD = repo).
- Pages: bare link / `?page=start` → Start.html (tiles + "De app delen met leerlingen"), `?page=review` → Review.html,
  `?page=curriculum` → CurriculumPage.html (`serveTeacher_` in Teacher.gs; `include_()` pulls in TeacherStyle / TeacherStrings
  (ALL Dutch labels + ⓘ instructions) / TeacherNav). Curriculum editor = the intended way to edit the Curriculum
  (hand edits still work): CurriculumEditor.gs (load/save/undo/new subject, whole tab in one write under LockService, version
  stamp, hidden Curriculum_backup) + CurriculumLogic.html (pure, tested in src/curriculumEditor.test.ts).
  Manual test list: docs/SHEET.md › Curriculum editor.
- `doGet ?page=…` serves a page only when the visitor's email is in Script Properties TEACHER_EMAILS /
  TEACHER_DOMAIN (`admin <env> setTeachers`). The anonymous API deployment has no userinfo scope → never
  serves it. Page ↔ server via google.script.run (`review*` functions, each `requireTeacher_()`); no token.
- Controleren, Eén voor één: Goedkeuren · Afkeuren (Kaarten only → back to the Inbox with the edits, `reviewCardToInbox`)
  · Vorige · Volgende · Verwijderen (`reviewDelete`, Inbox or Cards row). No Opslaan: edits are saved by those buttons.
  No 🚩 nakijken marking (column and Inbox status removed): a card that needs another look goes to the Inbox.
- Card approval: Cards.`controle` (`goedgekeurd|afgekeurd|blank` → `approved|rejected|''`, `CHECK_NL`/`checkCode_`).
  With Settings.`require_approval` the API serves only approved
  cards (`cardServed_` in Util.gs; also the Dashboard curriculum). Teacher page: Goedkeuren (`reviewSetCheck`),
  Afkeuren = back to the Inbox. Turn on per env with `admin <env> enableApproval` (dry run;
  approveStudied keeps her studied cards). All AI-made cards started blank (2026-10-02).

## Instellingen (phone only) and settings access

- Menu › ⚙️ Instellingen (`screens/SettingsScreen.tsx`): rows from `SETTING_ROWS` (src/userSettings.ts) — "Max.
  aantal nieuwe woorden per dag" (5/10/15/20, plus "Standaard (X)" when the Sheet value is not one of them) and
  "Luisteroefeningen" and "Antwoord voorlezen" (default on: a Dutch answer is read out once when shown, `answerIsDutch`
  in src/tts.ts; both disabled + "Geen Nederlandse stem op dit toestel." without a Dutch voice). Stored in
  IndexedDB `meta.userSettings` = {newPerDay, listeningEnabled, readAnswer} (null = default), saved instantly, NEVER sent to
  the Sheet or a server.
- ONE accessor, `src/settings.ts`: `useSettings()` (components) / `currentSettings()` (other code) merge the Sheet
  Settings, her userSettings and `hasVoice`. `new_per_day` there is already `getNewPerDay(sheet, user)`;
  `listening` = voice && her toggle; `listenMode()` (src/tts.ts) decides listening cards. Components never read
  `state.settings` / `state.userSettings` directly (`useSettingControls()` / `setUserSetting()` for the page).
- JSON backup (same page; `src/backup.ts`): export = progress, unsent reviews, 🚩 flags, intro, doneToday,
  dayCounts, studyTags, userSettings (no cards). Import MERGES (newer progress/flag wins, reviews added, today's
  records only from today) and refuses files of the other app (DEV/PROD). iPhone: share sheet; else a download.

## OpenMoji pictures (emoji cards)

- Picture cards (`enkel`, front = one emoji, a regional-indicator letter 🇦–🇿 for the alphabet, or "openmoji:E0C0" for
  an OpenMoji-only picture) ALWAYS show the OpenMoji COLOUR picture, never the phone's emoji (`openmojiFor` in the
  generated `src/openmoji.ts`, `isPictureFront` in src/display.ts, `<img>` in CardFace). A missing picture shows a
  neutral "?" box and a console warning.
- `npm run openmoji` (scripts/openmoji.mjs) maps EMOJI_SEED_CARDS + `scripts/openmoji-extra.json` (committed list of all
  other picture fronts, grouped; OpenMoji-only by hexcode) to hexcodes from `openmoji` (exact-pinned devDependency) and
  copies ONLY those SVGs, SVGO-optimised, to `public/openmoji/` (+ LICENSE.txt). Self-hosted only (never openmoji.org /
  CDNs); precached by the service worker (globPatterns include svg). Add new picture cards' emoji to the JSON, re-run,
  commit `public/openmoji/` + `src/openmoji.ts`; unmatched emoji are listed. OpenMoji 17.0.0 has no E1DB.
- Checks: src/openmoji.test.ts (every seed and JSON emoji has a picture; only used SVGs shipped) and
  `npm run openmoji:check -- <env>` (every picture card in Cards AND the Inbox of that sheet has a picture; exit 1 if not).
- Credit (CC BY-SA 4.0) on Over SpeesRep (`about.images`, `about.license`). Source lists (docs/openmoji-*.csv) stay
  out of git.

## Listening and Voortgang

- `src/tts.ts`: phone voices only (Web Speech API, offline with an installed voice). `pickDutchVoice` prefers
  nl-NL, then nl-BE, then any nl. 🔊 (`SpeakButton`) on the Dutch side of every card; without a Dutch voice it
  shows "Geen Nederlandse stem op deze telefoon." (Hulp explains how to install one on iPhone/Android).
- Listening cards: with a Dutch voice, about Settings.`listen_share` (0.3) of word-recognition reviews start
  with only the sound ("Wat hoor je?"), Log mode `listen` (`isListeningReview`, deterministic per card+reps).
- "Voortgang" (`screens/ProgressScreen.tsx`, `src/stats.ts`): geoefend / bekend / reviews this week / streak /
  7-day chart / due today-tomorrow-7 days. Per-day counts are stored on the phone (`meta.dayCounts`, written
  in the same transaction as each rating) — they start counting from that update.
- `src/curriculumParity.test.ts` loads the real Curriculum.gs and compares validation + status with curriculum.ts.

## Android (additive; same service worker, caching and IndexedDB)

- Manifest icons: 192/512 `purpose: any` + 512 `maskable` (content inside the inner ~78 %; DEV badge inside
  the safe circle) — `scripts/make-icons.mjs`.
- `src/installPrompt.ts`: catches `beforeinstallprompt` (suppresses Chrome's banner); "⬇ App installeren"
  shows on home only after she rated ≥ 3 cards in one visit (`markEngaged`) and not when already installed.
  iOS keeps the Share → "Zet op beginscherm" hint.
- Device test pass incl. one physical Android phone: docs/RELEASE.md.

## Rating buttons

- Left to right, equal width, all four in one row on an iPhone SE, each ≥ 56 px tall:
  emoji (large) / Dutch label / interval (smallest). `RATINGS` + `INTERVAL_UNITS` in `src/i18n.ts`:
  ❌ Opnieuw (1) · 😅 Moeilijk (2) · ✅ Goed (3) · 😎 Makkelijk (4).
- Intervals from ts-fsrs, formatted by `formatInterval`: "10 min", "2 u", "3 d", "3 wk", "4 mnd", "1 jr".
- `aria-label` = "<Dutch label>, <interval>".
- **Every card is self-rated** (the core feature): she reads the front, taps "Antwoord tonen", then
  rates herself. There are no typed answers anywhere.
- One-time overlay (first review) explains the four buttons in French
  ("Opnieuw = je ne savais pas", "Moeilijk = j'ai hésité", "Goed = bien", "Makkelijk = très facile");
  a small `?` reopens it. This is the only place the button labels are translated.

## Sheet values are Dutch

Types `dubbel|enkel|zin|vraag` (old `woord`/`calc` still read), Dutch tag
keys, pos and descriptions (no tags_source column since 2026-10-05). The API maps them to internal codes (`typeCode_` in
`apps-script/Util.gs`); the client only sees `word|oneway|sentence|question` and `manual|auto`. Text columns
(incl. `answer`) are plain text, so times stay text.

- `enkel` (oneway): front `nl`, back `answer`, one direction, self-rated; `answer` is display text only.
  Clock-card answer rules (durations 15/30/45/60/90 min in both forms; two-digit clock times get
  " of <spoken> 's <dagdeel>", one-digit hours don't; midnight is "00:MMu"): docs/SHEET.md › Writing enkel.
- Subject label above the card = `subject_nl` of the first tag that has one (`subjectFor`, src/display.ts).

## Curriculum and today's work

- Curriculum tab (`order, tag, regel, datum, percentage, van_tags`) decides which topics bring NEW cards
  (`src/curriculum.ts`, pure, recalculated on every render). Each row has its OWN rule: altijd | datum | bekend
  (every van_tag ≥ percentage % bekend; van_tags only from higher rows) | dicht (parked, other columns kept) →
  always|date|known|closed. Latch: open topics are stored in `meta.curriculumOpened` (dicht clears it). No row =
  never; untagged cards never. `order` only orders the new-card slots. Bekend = Settings `known_stability_days` (7)
  + `known_min_reviews` (2). Shared validation `validateCurriculum` / `validateCurriculum_` (broken row = closed,
  latch kept). `apps-script/Curriculum.gs` mirrors validation + status (Dashboard) — parity test. Full rules:
  docs/SHEET.md › Curriculum.
- Studying now (no sessions, no timers, no cooldown): `planToday` (src/session.ts) + `src/today.ts`. The round = started
  cards due in LESS than `due_window_minutes` (strict), capped at `max_reviews_per_day` (overflow rolls over), + new
  cards from `getNewPerDay()` — the ONLY reader of `new_per_day`. `interleave`: due first, 1 new per 3 due. A rated
  card goes back into the run ONLY if its next step is inside the window (`afterRating`, src/sessionFlow.ts) —
  ONE rule, `inDueWindow` (src/today.ts), for the round, the requeue and "done", so they never disagree; "Goed"
  (10 min) and "Makkelijk" leave the run and return via the later-today line. `pickNextIndex`: a card in a short
  step is not shown before its due time while other cards are ready (if only such cards are left, the first due
  one is shown). Home: "Vandaag" bar = current round
  (`meta.round`, `nextRound`: finished → new round at 0, arrivals join a running round; written in
  `recordReview`'s transaction; `meta.doneToday` stays for the daily cap), "Klaar voor nu!", and the later-today
  line `laterToday` ("Volgende kaarten: 5 over ± 30 min" = when the 5th later card is due; < 5 → no line). Recomputed on screen change / focus plus ONE wake-up at
  `later.nextAt` — never a countdown. The review screen shows only the card.

## Study by topic, new-card pacing

- "Kies een onderwerp" (`src/screens/Topics.tsx`): multi-select of the Curriculum topics that are not dicht and have
  cards, alphabetical by label_nl (🔒 = not open yet). Stored in `meta.studyTags`; today's work then uses due + new cards with ANY selected
  tag. Empty = everything.
- A new card waits while ≥ `max_learning_backlog` cards are in short learning steps
  (`pickNextIndex` in src/session.ts).

## 🚩 Student flags ("Gemarkeerd") — local only

- `src/studentFlags.ts` + IndexedDB store `flags` (DB version 2): `{id, card_id, ts, note, resolved, updated_ts}`.
  Every tap is a new entry; resolving never deletes. Stable field names so a future sync could push them,
  but there is NO sync: they leave the phone only via her "Delen" (Web Share) or "Kopieer naar klembord".
- UI: 🚩 on every card in review (`FlagButton`: tap = flag + "Gemarkeerd" toast with "+ notitie";
  long-press = flag + note field; lit when the card has an open flag). "Gemarkeerd" screen (`screens/Marked.tsx`)
  shows ONE row per card (`groupFlags`: "3×", all notes; Opgelost resolves all its open flags); counts are cards.
- Menu: tap "SpeesRep" (`components/Menu.tsx`; red dot on the title = open 🚩 flags or unsent answers) → 📈 Voortgang,
  🚩 Gemarkeerd (count),
  ⚙️ Instellingen, ℹ️ Over SpeesRep (`screens/AboutScreen.tsx`: about, privacy, OpenMoji CC BY-SA 4.0 credit).
  Below them the sync status (`components/SyncBox.tsx`: last sync, cards, unsent answers, "Synchroniseren");
  home no longer shows it. Syncing stays automatic.
- A flag stores the card's name (`label`, at flag time and in `saveSnapshot` before cards are replaced), so
  "Gemarkeerd" still names a card that left the phone (e.g. not approved).
- Strings use the `mark.*` i18n keys. Never mix up with `Card.flags` / `flag.*` (sheet content markers:
  false-friend, separable).

## Domain rules

- Card types (internal codes): `word` (dubbel), `oneway` (enkel: nl → answer), `sentence` (target word in
  `{braces}` → cloze), `question` (fr = prompt/front, nl = answer/back).
- Two FSRS tracks: word cards have `recog` (NL→FR, listening) and `prod` (FR→NL, self-rated like every card);
  sentence/question cards only `prod`. `prod` unlocks when `recog` stability ≥ `unlock_prod_stability_days`.
- Scheduling (`src/scheduler.ts`, `src/session.ts`): ts-fsrs, fuzz on, retention from Settings. The four
  outcomes are computed once when the answer is revealed; the tapped one is applied, so the interval on
  the button is exactly what is scheduled. Steps inside the due window (< due_window_minutes) come back in the same run.
- New cards per day capped by Settings.`new_per_day`, ordered by `added` (then sheet order). A word's
  unlocked `prod` track has its own cap of the same size. Today's introductions are stored (`meta.intro`).
- Each rating = progress + outbox event + intro list in ONE IndexedDB transaction (`recordReview`).
  Pushed a few seconds later when online, and on every sync; removed only when the server confirms.
- Abbreviations (`ABBREV_SEED_CARDS`, enkel, flag `abbreviation` → badge "afkorting"): setup places each one in the
  category where it is first used, in the row directly above the first card that uses it (same `added`).
- Nouns always show de/het. Sheet flag `false-friend` shows the badge "valse vriend"; `separable` is NOT shown
  (`HIDDEN_FLAGS` in src/display.ts) — it stays in the sheet as teacher metadata.

## Offline and sync (never lose a review)

- The app shell is precached by the service worker; all active cards, settings, tags,
  curriculum and her Progress live in IndexedDB (`speesrep-dev` / `speesrep-prod`). `navigator.storage.persist()`.
- A rating writes progress + outbox event in one transaction. The outbox is pushed ~4 s later when online,
  immediately when the connection returns (also during review), and at every sync. Events leave the outbox
  only when the server lists them as accepted or duplicate; the server de-duplicates on `event_id`.
- Sync = push → pull cards/settings + Progress → merge (server wins only if newer AND no unsent local
  review) → push again. Runs at launch, when back online, when the app returns to the foreground (> 2 min
  since the last sync) and on "Synchroniseren" (in the menu).
- `useOnline()` is ONE shared flag (src/pwa.ts); don't add per-component online listeners.
- IndexedDB upgrades (bump the version in `db()`, add stores in `upgrade(d, oldVersion)` only): an open copy of the
  app closes its connection and reloads when a newer version needs to upgrade (`blocking`); if an old copy still
  blocks, a toast asks to close it (`blocked`). Copies from before 2026-10-02 don't let go — close them.
- Tests: `src/queue.test.ts` (idempotent push, lost replies, merge) and `e2e/offline.spec.ts` (Playwright:
  online load → offline reload → review → reconnect with a lost reply → exactly-once on the mock server).

## Deploy rules (standing instructions)

- **PROD deploy → keep her progress**: follow the "PROD safety checklist" in docs/RELEASE.md every time
  (`npm run backup:prod` before and after, additive changes only, dry runs, verify counts and the live app).
  Any change that would break PROD progress needs the teacher's explicit permission first.
- **DEV progress is expendable**: DEV cards may be moved/replaced/reset without asking.

## Content work (standing instructions)

- PROD sheet changes: `npm run backup:prod` before and after (Log/Progress counts must stay the same), dry run
  first, additive only. Ask before anything that hides or deletes studied cards.
- New content goes to the DEV Inbox. The teacher approves it on the teacher page; approved cards are then copied
  to PROD with `admin prod importCards` (keeps ids). Cards deliberately removed from PROD are not copied back.
- Every card needs at least one subject (tag) from the Tags tab. Subjects are managed on the Curriculum page
  (Dicht = parked). On PROD a new subject needs its Tags row before its Curriculum row.
- Don't hunt for spelling errors and don't mention them; never mention a missing full stop. A spelling error
  noticed by chance → move that card to the Inbox silently (`cardsToInbox`).
- Source CSVs (docs/klim-op-*.csv) are git-ignored; keep them out of git.

## Commands

```bash
npm run dev              # local dev server (DEV API)
npm test                 # vitest
npm run e2e              # builds e2e-dist (mock API) + Playwright offline test
npm run build            # prod + dev into dist/
npm run gas:deploy:dev   # push + redeploy Apps Script (same URL)
npm run smoke:dev        # curl smoke test of the deployed API
npm run backup:prod      # Log/Progress/Cards → backups/ (git-ignored) before & after any PROD change
npm run admin -- dev listUntagged
npm run ui-strings       # regenerate docs/UI-STRINGS.md
npm run ui-vocab         # UI words not yet taught (warning)
```

Slash commands in `.claude/commands/` (all go through `scripts/admin.mjs`, default env dev):
- `/retag` — propose 0–3 existing tags per untagged card (new tag only if ≥ 3 cards use it), table, wait
  for OK, `setTags`.
- Word lists from files: parse, merge duplicates (tags combined), `appendInbox` (dedupes on
  type + nl + article). Source lists stay out of git (`.gitignore`, e.g. docs/klim-op-woordenlijst-frans.csv).
- `/addwords <theme, n, level>` — dedupe against Cards + Inbox, table, wait for OK, `appendInbox`
  (status voorgesteld). Never writes Cards.
- `/promote` — show `goedgekeurd` Inbox rows, wait for OK, `promoteInbox`.

Teacher review page: docs/SHEET.md › Teacher review page. Curriculum in plain words: docs/teacher-manual.md.
