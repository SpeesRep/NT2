---
description: Move approved Inbox rows into Cards
argument-hint: "[dev|prod]  (default dev)"
---

Promote Inbox rows with status `goedgekeurd` (approved) to Cards. The API reports statuses as `proposed`/`approved`. Environment: `$ARGUMENTS` (`dev` if empty).

Use ONLY `node scripts/admin.mjs <env> …`; never read or print `.env.local` or tokens.

1. `node scripts/admin.mjs <env> listInbox`. Show a table of rows with status `approved` (sheet: `goedgekeurd`)
   (`nl | article | fr | tags | flags`) and how many are still `proposed` (sheet: `voorgesteld`). Warn about nouns without
   de/het. If nothing is approved, say so and stop.
2. STOP and wait for my OK.
3. `node scripts/admin.mjs <env> promoteInbox` — moves every approved row into Cards (added = today,
   active) and deletes it from the Inbox.
4. Report the promoted cards. They reach the phone on its next sync; new cards are introduced in `added`
   order after older unseen ones (and after the curriculum tags, see docs/SHEET.md › Curriculum).
