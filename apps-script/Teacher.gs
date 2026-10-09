// OWNER-ONLY pages (Start · Controleren · Curriculum) from Fanki, kept for approving drafts in the shared bank until
// the /docent/ teacher page replaces them (spec phases 5–6). Served by a SEPARATE web-app deployment that requires a
// Google login, runs as the visitor (USER_ACCESSING) and, since 2026-10-09, is open to the owner only (teacherAccess
// MYSELF in deploy.config.json). The browser gets no token: it calls the review* functions below through
// google.script.run, each of which checks the allowlist (Script Property TEACHER_EMAILS = the owner) first.

/** Card columns the review page may edit. */
var REVIEW_EDITABLE = ['type', 'nl', 'article', 'pos', 'example_nl', 'tags', 'flags', 'answer'];
/** Translation fields of the page: lang → [text field, example field] (Translations rows). */
var REVIEW_TRANSLATIONS = { fr: ['fr', 'example_fr'], en: ['en', 'example_en'] };

/** The visiting teacher's address, or '' (anonymous API deployment / no userinfo.email scope). */
function teacherEmail_() {
  try {
    return String(Session.getActiveUser().getEmail() || '').toLowerCase();
  } catch (e) {
    return '';
  }
}

function teacherAllowed_(email) {
  if (!email) return false;
  var p = props_();
  var list = String(p.getProperty('TEACHER_EMAILS') || '').toLowerCase().split(/[\s,;]+/).filter(String);
  var domain = String(p.getProperty('TEACHER_DOMAIN') || '').toLowerCase().replace(/^@/, '');
  return list.indexOf(email) !== -1 || (!!domain && email.split('@')[1] === domain);
}

function requireTeacher_() {
  var email = teacherEmail_();
  if (!teacherAllowed_(email)) throw new Error('Geen toegang' + (email ? ' voor ' + email : '') + '.');
  return email;
}

var TEACHER_PAGES = { start: { file: 'Start', title: 'leraar' }, review: { file: 'Review', title: 'controleren' },
  curriculum: { file: 'CurriculumPage', title: 'curriculum' } };
// The learner app per environment (shown on Start › "De app delen met leerlingen"; public anyway).
var APP_URLS = { DEV: 'https://speesrep.github.io/NT2/dev/', PROD: 'https://speesrep.github.io/NT2/' };

/** Contents of another HTML file, for <?!= include_('TeacherStyle') ?> in the page templates. */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** The /exec URL of the teacher deployment (written by scripts/gas-deploy.sh), else this deployment's URL. */
function teacherUrl_() {
  if (typeof TEACHER_URL === 'string' && TEACHER_URL) return TEACHER_URL;
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}

/** What waits on Controleren: drafts in the bank. */
function reviewTodo_() {
  var drafts = readTable_(sheet_('Cards')).rows.filter(function (r) { return String(r.nl).trim() && cardStatus_(r.status) === 'draft'; }).length;
  return { inbox: drafts, cards: 0 };
}

/**
 * doGet(?page=start|review|curriculum) → the page, only for an allowed visitor; null otherwise (the caller then
 * answers with JSON). The anonymous API deployment has no userinfo scope, so it never serves a page.
 */
function serveTeacher_(page) {
  var email = teacherEmail_();
  if (!teacherAllowed_(email)) return null;
  var p = TEACHER_PAGES[page] ? page : 'start';
  var base = teacherUrl_();
  var t = HtmlService.createTemplateFromFile(TEACHER_PAGES[p].file);
  t.ctx = JSON.stringify({
    page: p, env: env_(), appUrl: APP_URLS[env_()] || '', todo: reviewTodo_(), publish: publishInfo_(),
    urls: { start: base + '?page=start', review: base + '?page=review', curriculum: base + '?page=curriculum' }
  }).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle('SpeesRep – ' + TEACHER_PAGES[p].title + ' (' + env_() + ')')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- row <-> object ----------

/** A Cards row (+ its translations) → the page's card: card fields, fr/example_fr, en/example_en, check. */
function reviewRow_(r, tr) {
  var c = cardToJson_(r, tr);
  var status = cardStatus_(r.status);
  c.row = r._row;
  c.status = status === 'draft' ? 'proposed' : '';
  c.check = status === 'draft' ? '' : status; // 'approved' | 'rejected' in the Kaarten list
  Object.keys(REVIEW_TRANSLATIONS).forEach(function (lang) {
    var f = REVIEW_TRANSLATIONS[lang], t = (tr || {})[lang];
    c[f[0]] = t ? t.text : '';
    c[f[1]] = t ? t.example : '';
  });
  return c;
}

/**
 * One row by id without reading the whole tab: Sheets' TextFinder on column A, then just that row.
 * Returns the row object with `_row` (like readTable_ rows) or null.
 */
function findById_(sh, id) {
  if (!id) return null;
  var last = sh.getLastRow();
  if (last < 2) return null;
  var hit = sh.getRange(2, 1, last - 1, 1).createTextFinder(String(id)).matchEntireCell(true).matchCase(true).findNext();
  if (!hit) return null;
  var headers = headersOf_(sh);
  var values = sh.getRange(hit.getRow(), 1, 1, headers.length).getValues()[0];
  var o = { _row: hit.getRow() };
  headers.forEach(function (h, j) { o[h] = values[j]; });
  return o;
}

/**
 * Merges the editable card fields (client codes → Dutch sheet values) into `row` and writes the row in ONE call,
 * then the translation fields into Translations (an edited language becomes reviewed: the owner wrote or checked it).
 * Returns the updated row object. Caller holds the lock.
 */
function writeFields_(sh, row, fields) {
  var headers = headersOf_(sh);
  var o = {};
  headers.forEach(function (h) { o[h] = row[h]; });
  REVIEW_EDITABLE.forEach(function (k) {
    if (!fields.hasOwnProperty(k)) return;
    var v = fields[k];
    if (k === 'type') v = typeNl_(typeCode_(v) || 'word');
    else if (k === 'tags' || k === 'flags') v = (Array.isArray(v) ? v : splitTags_(v)).join(', ');
    else if (k === 'article') v = v === 'de' || v === 'het' ? v : '';
    else v = String(v == null ? '' : v).trim();
    o[k] = v;
  });
  sh.getRange(row._row, 1, 1, headers.length).setValues([headers.map(function (h) { return o[h] === undefined ? '' : o[h]; })]);
  var existing = readTranslations_(), id = String(o.id);
  Object.keys(REVIEW_TRANSLATIONS).forEach(function (lang) {
    var f = REVIEW_TRANSLATIONS[lang];
    if (!fields.hasOwnProperty(f[0]) && !fields.hasOwnProperty(f[1])) return;
    var cur = (existing[id] || {})[lang] || { text: '', example: '' };
    var text = fields.hasOwnProperty(f[0]) ? fields[f[0]] : cur.text;
    var example = fields.hasOwnProperty(f[1]) ? fields[f[1]] : cur.example;
    if (String(text || '').trim() === cur.text && String(example || '').trim() === cur.example) return;
    setTranslation_(id, lang, text, example, 'reviewed', existing);
  });
  o._row = row._row;
  return o;
}

/** Required fields per type (Dutch messages for the page). */
function validateCard_(c) {
  var errors = [];
  var type = typeCode_(c.type) || 'word';
  if (!String(c.nl || '').trim()) errors.push('nl ontbreekt');
  if (!(c.tags || []).length) errors.push('kies minstens één onderwerp (tag)');
  if (type === 'oneway' && !String(c.answer || '').trim()) errors.push('answer ontbreekt (enkel)');
  if (type !== 'oneway' && !Object.keys(REVIEW_TRANSLATIONS).some(function (l) { return String(c[REVIEW_TRANSLATIONS[l][0]] || '').trim(); })) {
    errors.push('vertaling ontbreekt (fr of en)');
  }
  if (type === 'sentence' && !/\{[^}]+\}/.test(String(c.nl || ''))) errors.push('zin: zet het doelwoord tussen {accolades}');
  var noun = /zelfstandig|noun/i.test(String(c.pos || ''));
  if (type === 'word' && noun && c.article !== 'de' && c.article !== 'het') errors.push('zelfstandig naamwoord zonder de/het');
  return errors;
}

/**
 * The card's status (caller holds the lock). approved: its translations become reviewed and it lands in the INBOX of
 * the owner's default group (spec › card workflow step 4; the teacher accepts or hides it on /docent/). A card the
 * group already has (accepted / hidden) keeps that status. draft / rejected: the card leaves every group's content
 * at the next Publiceren (its GroupCards rows stay).
 */
function setCardStatus_(sh, row, status) {
  sh.getRange(row._row, headersOf_(sh).indexOf('status') + 1).setValue(status);
  if (status !== 'approved') return;
  setTranslationsStatus_(String(row.id), 'reviewed');
  var code = defaultGroup_().group_code, gc = sheet_('GroupCards');
  var hit = readTable_(gc).rows.filter(function (r) { return r.group_code === code && String(r.card_id) === String(row.id); })[0];
  if (!hit) gc.getRange(nextRow_(gc, 1), 1, 1, SCHEMA.GroupCards.length)
    .setValues([rowFromObject_(SCHEMA.GroupCards, { group_code: code, card_id: String(row.id), status: 'inbox', updated: new Date() })]);
}

// ---------- called from the page (google.script.run) ----------

function reviewBootstrap() {
  var email = requireTeacher_();
  return {
    env: env_(),
    build: typeof REVIEW_BUILD === 'string' ? REVIEW_BUILD : 'repo',
    email: email,
    tags: readTable_(sheet_('Tags')).rows.map(function (r) {
      return { tag: String(r.tag).trim().toLowerCase(), label: String(r.label_nl || r.tag) };
    }).filter(function (t) { return t.tag; }),
    types: [{ code: 'word', nl: 'dubbel' }, { code: 'oneway', nl: 'enkel' }, { code: 'sentence', nl: 'zin' }, { code: 'question', nl: 'vraag' }],
    flags: ['false-friend', 'separable'],
    requireApproval: true
  };
}

/** "Inbox" = the drafts of the bank, oldest first. */
function reviewListInbox() {
  requireTeacher_();
  var tr = readTranslations_();
  return readTable_(sheet_('Cards')).rows
    .filter(function (r) { return String(r.nl).trim() && cardStatus_(r.status) === 'draft'; })
    .map(function (r) { return reviewRow_(r, tr[String(r.id)]); })
    .sort(function (a, b) { return a.added.localeCompare(b.added) || a.row - b.row; });
}

/**
 * "Kaarten" = approved and rejected cards, paged; optional text query (nl/fr/en/answer), tag, and filter: 'all'
 * (default), 'approved', 'rejected' ('unchecked' is always empty: unchecked cards are drafts). Also returns counts.
 */
function reviewListCards(offset, limit, query, tag, check) {
  requireTeacher_();
  var q = String(query || '').trim().toLowerCase();
  check = check || 'all';
  var tr = readTranslations_();
  var cards = readTable_(sheet_('Cards')).rows
    .filter(function (r) { return String(r.id).trim() && String(r.nl).trim() && cardStatus_(r.status) !== 'draft'; })
    .map(function (r) { return reviewRow_(r, tr[String(r.id)]); });
  var counts = { unchecked: 0, approved: 0, rejected: 0, all: cards.length };
  cards.forEach(function (c) { counts[c.check]++; });
  var tagCounts = {};
  var all = cards.filter(function (c) {
    if (check !== 'all' && c.check !== check) return false;
    c.tags.forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    if (tag && c.tags.indexOf(tag) === -1) return false;
    return !q || (c.nl + ' ' + c.fr + ' ' + c.en + ' ' + c.answer).toLowerCase().indexOf(q) !== -1;
  });
  offset = Math.max(0, Number(offset) || 0);
  limit = Math.min(200, Math.max(1, Number(limit) || 50));
  return { total: all.length, offset: offset, rows: all.slice(offset, offset + limit), counts: counts, tagCounts: tagCounts };
}

/** Kaarten: Goedkeuren ('approved') / Afkeuren ('rejected') / reset ('' = draft). Approve refuses invalid cards. */
function reviewSetCheck(ids, value) {
  requireTeacher_();
  var status = value === 'approved' || value === 'rejected' ? value : 'draft';
  return withLock_(function () {
    var sh = sheet_('Cards'), tr = readTranslations_(), done = [], errors = [];
    (ids || []).forEach(function (id) {
      var row = findById_(sh, id);
      if (!row) return;
      if (status === 'approved') {
        var e = validateCard_(reviewRow_(row, tr[String(id)]));
        if (e.length) { errors.push({ id: id, errors: e }); return; }
      }
      setCardStatus_(sh, row, status);
      done.push(id);
    });
    return { done: done, errors: errors };
  });
}

function reviewSave(source, id, fields) {
  requireTeacher_();
  return withLock_(function () {
    var sh = sheet_('Cards');
    var row = findById_(sh, id);
    if (!row) throw new Error('Kaart niet gevonden (al verwijderd?)');
    if (source === 'cards' && fields && fields.tags !== undefined && !(Array.isArray(fields.tags) ? fields.tags : splitTags_(fields.tags)).length) {
      throw new Error('Een kaart heeft minstens één onderwerp nodig. Zonder onderwerp: Terug naar Inbox.');
    }
    var o = writeFields_(sh, row, fields || {});
    return reviewRow_(o, readTranslations_()[String(id)]);
  });
}

/** Goedkeuren (a draft): save the edits, validate, status approved (see setCardStatus_). */
function reviewApprove(id, fields) {
  requireTeacher_();
  return withLock_(function () { return approveRow_(id, fields); });
}

/** The approve work itself (caller holds the lock). */
function approveRow_(id, fields) {
  var sh = sheet_('Cards');
  var row = findById_(sh, id);
  if (!row) throw new Error('Kaart niet gevonden (al verwijderd?)');
  if (fields) row = writeFields_(sh, row, fields);
  var errors = validateCard_(reviewRow_(row, readTranslations_()[String(id)]));
  if (errors.length) return { ok: false, errors: errors };
  setCardStatus_(sh, row, 'approved');
  return { ok: true, id: String(id) };
}

/** Keur alle goed: approves several drafts in one go. */
function reviewApproveMany(ids) {
  requireTeacher_();
  return withLock_(function () {
    return (ids || []).map(function (id) {
      try {
        var r = approveRow_(id, null);
        return { id: id, ok: r.ok, errors: r.errors || [] };
      } catch (e) {
        return { id: id, ok: false, errors: [String(e.message || e)] };
      }
    });
  });
}

/** Verwijderen: deletes the card for good, with its translations and group rows (any source). */
function reviewDelete(source, id) {
  requireTeacher_();
  return withLock_(function () {
    var sh = sheet_('Cards');
    var row = findById_(sh, id);
    if (!row) throw new Error('Kaart niet gevonden (al verwijderd?)');
    sh.deleteRow(row._row);
    deleteRowsWhere_('Translations', 'card_id', id);
    deleteRowsWhere_('GroupCards', 'card_id', id);
    return { ok: true };
  });
}

/** Afwijzen (a draft): status rejected — it stays in the bank and does not come back for review. */
function reviewReject(id) {
  requireTeacher_();
  return withLock_(function () {
    var sh = sheet_('Cards');
    var row = findById_(sh, id);
    if (!row) throw new Error('Kaart niet gevonden (al verwijderd?)');
    setCardStatus_(sh, row, 'rejected');
    return { ok: true };
  });
}

/** Terug naar Inbox: the card becomes a draft again (same id), with the edits. */
function reviewCardToInbox(id, fields) {
  requireTeacher_();
  return withLock_(function () {
    var sh = sheet_('Cards');
    var row = findById_(sh, id);
    if (!row) throw new Error('Kaart niet gevonden');
    if (fields) row = writeFields_(sh, row, fields);
    setCardStatus_(sh, row, 'draft');
    return { ok: true };
  });
}
