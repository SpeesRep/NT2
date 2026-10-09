# SpeesRep API (Apps Script web app)

One `doPost` endpoint per environment (URLs: `deploy.config.json` → `https://script.google.com/macros/s/<deploymentId>/exec`).
Body: JSON sent as `text/plain` (no CORS preflight): `{action, key, …}`. Answer: HTTP 200 with `{ok:true,…}` or
`{ok:false, error, message}`. Students never call it (the app reads `content.json` from its own site).

## Keys (apps-script/Auth.gs)

- **Teacher**: personal invite key, 32 characters (no look-alikes), in the link `…/docent/#key=<key>` (after `#`, so it
  is never sent to a server or logged). Only its SHA-256 is stored (`Teachers.key_hash`). Valid while the teacher and
  the institution are active. Lost key / new device / leaving: `admin.reissueKey` or `admin.setTeacherActive false`.
- **Owner**: admin key, SHA-256 in Script Property `ADMIN_KEY_HASH`. Locally in `.env.local` (`ADMIN_KEY_DEV|PROD`,
  git-ignored) for `scripts/admin.mjs`, and as GitHub secrets `ADMIN_KEY_DEV|PROD` for the Admin action and Publish
  content workflows.
- Every failed key is counted (CacheService, 10 min); after 20 failures every key check is refused for that time
  (Apps Script sees no IP addresses), and each failure waits 0.8 s.

## Teacher actions (apps-script/TeacherApi.gs)

`group` in the body is always checked on the server: the group must be active, of the teacher's own institution,
and assigned to the teacher in `GroupTeachers` (`requireGroup_`).

| action | body | answer |
|---|---|---|
| `me` | — | `{label, groups:[{code, display_name, languages}]}` |
| `inbox` | `group` | approved cards waiting for this group (GroupCards inbox), with translations in the group's languages |
| `reviewCards` | `group, decisions:[{card_id, status: accepted\|hidden}]` | `{done, refused}`; only cards already in this group's GroupCards |
| `getCurriculum` | `group` | `{rows, version, topics:[{tag, label, cards, bank}], known}` |
| `saveCurriculum` | `group, rows, version` | `{ok, version}`, or `{conflict:true}` when a colleague saved first, or `{checks}` (validation errors) |
| `propose` | `group, proposal:{type:new, nl, example_nl?, note?}` or `{type:correction, card_id, note}` | `{proposal_id}` |
| `joinInfo` | `group` | `{code, link: …/?groep=<code>, page: …/g/<code>/}` |
| `publish` | `group` | repository_dispatch to GitHub (whole site); max 4 per group per hour |

Writes run under LockService and are logged in `AuditLog` (timestamp, teacher_id, action, group_code).

## Owner actions (admin key; apps-script/AdminApi.gs and Api.gs)

`admin.overview` · `admin.createInstitution {label}` · `admin.createTeacher {inst_id, label}` → `{teacher_id, invite}`
(the only time the key is shown) · `admin.reissueKey {teacher_id}` · `admin.setTeacherActive {teacher_id, active}` ·
`admin.createGroup {inst_id, display_name, languages, copyCurriculumFrom?}` → `{group_code}` · `admin.updateGroup
{group_code, display_name?, languages?, active?}` · `admin.assignTeacher / admin.unassignTeacher {group_code,
teacher_id}` (same institution only) · `admin.setTranslations {rows:[{card_id, lang, text, example?, status?}],
dryRun}` (never replaces a reviewed row with a machine one) · `admin.setAdminKeyHash {hash}`.
Older owner actions: `content` (the Publish content workflow), `migrateV2`, `listCards`, `tags`, `readTab`,
`deleteTabs`, `setSetting`, `groups`.

```bash
node scripts/admin.mjs dev admin.overview
node scripts/admin.mjs dev admin.createTeacher '{"inst_id":"i_…","label":"Docent A"}'
```
