---
description: Propose Dutch tags for untagged cards, then write them after approval
argument-hint: "[dev|prod]  (default dev)"
---

Retag untagged cards in the SpeesRep sheet. Environment: `$ARGUMENTS` (use `dev` if empty; `prod` only if I
wrote `prod`).

Rules:
- Use ONLY `node scripts/admin.mjs <env> <action> [json|@file]` for the API. It reads the admin token from
  `.env.local`. Never read, print, echo or paste the token or `.env.local`.
- Tag keys are Dutch (e.g. `huishouden`, `reizen`). Card types in the sheet are `woord|zin|vraag`
  (the API returns `word|sentence|question`).

Steps:
1. `node scripts/admin.mjs <env> listUntagged` → active cards with no tags.
   `node scripts/admin.mjs <env> tags` → the tag vocabulary (tag, label_nl, label_fr, description).
2. For each card propose 0–3 tags from the existing vocabulary, based on nl, fr and the example. 0 tags is
   fine when nothing fits. Never propose `app` or `klok-*` (curriculum tags are handled by hand).
3. A NEW tag may be proposed only if at least 3 of these cards would use it. List new tags separately
   with: key (Dutch, lowercase, no spaces), label_nl (A1 Dutch), label_fr, description (Dutch).
4. Show one table: `nl | fr | tags` (mark new tags with *), then the new-tag table. Say how many cards get
   0 tags. STOP and wait for my OK (I may edit the proposal).
5. After OK:
   - new tags first: write `{"add":[{"tag":…,"label_nl":…,"label_fr":…,"description":…}]}` to a scratch
     file and run `node scripts/admin.mjs <env> tags @<file>`.
   - then `{"updates":[{"id":…,"tags":[…]}]}` → `node scripts/admin.mjs <env> setTags @<file>`
     (skip cards with 0 tags).
6. Report updated/skipped counts from the response (skipped reasons: unknown_tags, too_many_tags, not_found).
