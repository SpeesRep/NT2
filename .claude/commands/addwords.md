---
description: Generate a themed list of new cards into the Inbox (status proposed) — never writes to Cards
argument-hint: "<theme>, <count> words, <level>  [dev|prod]   e.g. wiskunde, 25 words, A2"
---

Propose new Dutch cards for the learner (French speaker) and put them in the **Inbox** tab, status
`proposed`. Request: `$ARGUMENTS`. Environment: `dev` unless the request says `prod`.

Rules:
- Use ONLY `node scripts/admin.mjs <env> <action> [json|@file]`. Never read or print `.env.local` or tokens.
- This command writes NOTHING to Cards. The teacher reviews the Inbox, sets status to `goedgekeurd`, then runs
  /promote.

Steps:
1. Fetch what exists: `node scripts/admin.mjs <env> listCards` and `node scripts/admin.mjs <env> listInbox`
   and `node scripts/admin.mjs <env> tags`. Skip any word whose nl (case-insensitive, without de/het)
   already exists in Cards or Inbox, and near-duplicates (plural/diminutive of an existing word).
2. Generate the requested number of cards at the requested CEFR level (default A2), useful for daily life
   in Belgium/the Netherlands:
   - `type` (API codes; the sheet shows the Dutch name): `word` = dubbel (default: NL ⇄ FR), `oneway` =
     enkel (nl = Dutch prompt, `answer` = back; e.g. clock sums), `sentence` = zin (target word in
     `{braces}`), `question` = vraag (fr = prompt, nl = answer) — only if the request asks for them.
   - `answer` (enkel only). Durations of exactly 15/30/45/60/90 min are written in both forms: "15 min of
     een kwartier", "30 min of een half uur", "45 min of drie kwartier", "60 min of een uur", "90 min of
     anderhalf uur" (not when the prompt already names that unit); other durations plain ("20 min"); clock
     times "HH:MMu" never. Clock times with a TWO-digit hour (10–23, midnight "00:MMu") get
     " of <spoken form> 's ochtends/middags/avonds/nachts"; one-digit hours don't; in sums the prompt uses the same
     number of hour digits as the answer ("09:40u + 20 min") (docs/SHEET.md › dagdeel rule).
   - `nl` (enkel prompts use explicit units: "X min", clock times "HH:MMu"); `article` `de`/`het` for EVERY noun (never blank for a noun; plural-only nouns get `de`).
   - `pos` in Dutch: zelfstandig naamwoord, werkwoord, scheidbaar werkwoord, bijvoeglijk naamwoord, bijwoord,
     uitdrukking, voorzetsel, telwoord.
   - `fr`: natural French translation; `example_nl`: short A1–A2 sentence; `example_fr`: its translation.
   - `tags`: existing Dutch tag keys that fit (the theme's tag if it exists). Never `app` or `klok-*`.
   - `flags`: `false-friend` when the Dutch word looks like a French word with another meaning (e.g.
     "gang"); `separable` for separable verbs (e.g. "optellen").
3. Show a table: `# | nl (with article) | pos | fr | example_nl | tags | flags`, plus the list of skipped
   duplicates. STOP and wait for my OK (I may remove or change rows).
4. After OK: write `{"rows":[{type,nl,article,pos,fr,example_nl,example_fr,tags:[…],flags:[…],answer}]}` to a
   scratch file and run `node scripts/admin.mjs <env> appendInbox @<file>`. The API gives each row an id,
   status `voorgesteld`, converts to Dutch sheet values, and skips rows whose (type, nl, article) is already in
   Cards or Inbox (so homographs like "het haar" / "haar" stay apart).
5. Report appended/skipped and remind me: set status to `goedgekeurd` in the Inbox, then run /promote.
