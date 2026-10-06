// Teacher review UI ("SpeesRep – controleren"): an HtmlService page served by a SEPARATE web-app deployment of
// this project that requires a Google login and runs as the visiting teacher (USER_ACCESSING). The public
// card API deployment (anonymous) never serves this page. The browser gets no token: it calls the review*
// functions below through google.script.run, each of which checks the teacher allowlist first.
//
// Allowlist: Script Property TEACHER_EMAILS (comma-separated) and/or TEACHER_DOMAIN (e.g. school.be).
// setup() puts the owner's address in TEACHER_EMAILS when it is empty. A teacher also needs edit access
// to the spreadsheet (the code runs with their own Google permissions).

var REVIEW_EDITABLE = ['type', 'nl', 'article', 'pos', 'fr', 'example_nl', 'example_fr', 'tags', 'flags', 'answer'];

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

/** What waits on Controleren: Inbox rows and Cards not yet goedgekeurd or afgekeurd. */
function reviewTodo_() {
  var inbox = readTable_(sheet_('Inbox')).rows.filter(function (r) { return String(r.nl).trim() && statusCode_(r.status) !== 'approved'; }).length;
  var cards = readTable_(sheet_('Cards')).rows.filter(function (r) {
    return String(r.nl).trim() && !checkCode_(r.controle);
  }).length;
  return { inbox: inbox, cards: cards };
}

/**
 * doGet(?page=start|review|curriculum) → the page, only for an allowed teacher; null otherwise (the caller then
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

function reviewRow_(r, isInbox) {
  var c = cardToJson_(r);
  c.row = r._row;
  c.status = isInbox ? (statusCode_(r.status) || 'proposed') : '';
  c.check = isInbox ? '' : checkCode_(r.controle);
  c.pos = String(r.pos || '');
  return c;
}

/** Header row only (one small read). */
function headersOf_(sh) {
  return sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
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
 * Merges the editable fields (client codes → Dutch sheet values) into `row` and writes the whole row in ONE call.
 * Returns the updated row object (no re-read needed). Text columns are already plain-text formatted by setup.
 */
function writeFields_(sh, row, fields) {
  var headers = headersOf_(sh);
  var o = {};
  headers.forEach(function (h) { o[h] = row[h]; });
  REVIEW_EDITABLE.forEach(function (k) {
    if (!fields.hasOwnProperty(k)) return;
    var v = fields[k];
    if (k === 'type') v = typeNl_(typeCode_(v) || 'word');
    else if (k === 'tags') v = (Array.isArray(v) ? v : splitTags_(v)).join(', ');
    else if (k === 'flags') v = (Array.isArray(v) ? v : splitTags_(v)).join(', ');
    else if (k === 'article') v = v === 'de' || v === 'het' ? v : '';
    else v = String(v == null ? '' : v).trim();
    o[k] = v;
  });
  sh.getRange(row._row, 1, 1, headers.length).setValues([headers.map(function (h) { return o[h] === undefined ? '' : o[h]; })]);
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
  if (type !== 'oneway' && !String(c.fr || '').trim()) errors.push('fr ontbreekt');
  if (type === 'sentence' && !/\{[^}]+\}/.test(String(c.nl || ''))) errors.push('zin: zet het doelwoord tussen {accolades}');
  var noun = /zelfstandig|noun/i.test(String(c.pos || ''));
  if (type === 'word' && noun && c.article !== 'de' && c.article !== 'het') errors.push('zelfstandig naamwoord zonder de/het');
  return errors;
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
    requireApproval: bool_(readSettings_().require_approval)
  };
}

/** Inbox rows with status voorgesteld, oldest first. */
function reviewListInbox() {
  requireTeacher_();
  return readTable_(sheet_('Inbox')).rows
    .filter(function (r) { return String(r.nl).trim() && statusCode_(r.status) !== 'approved'; })
    .map(function (r) { return reviewRow_(r, true); })
    .sort(function (a, b) { return a.added.localeCompare(b.added) || a.row - b.row; });
}

/**
 * Cards, paged; optional text query (nl/fr/answer), tag, and filter on controle: 'all' (default), 'unchecked'
 * (not approved or rejected yet), 'approved', 'rejected'. Also returns counts.
 */
function reviewListCards(offset, limit, query, tag, check) {
  requireTeacher_();
  var q = String(query || '').trim().toLowerCase();
  check = check || 'all';
  var cards = readTable_(sheet_('Cards')).rows.filter(function (r) { return String(r.id).trim() && String(r.nl).trim(); })
    .map(function (r) { return reviewRow_(r, false); });
  var counts = { unchecked: 0, approved: 0, rejected: 0, all: cards.length };
  cards.forEach(function (c) { counts[c.check || 'unchecked']++; });
  var tagCounts = {};
  var all = cards.filter(function (c) {
    if (check !== 'all' && (c.check || 'unchecked') !== check) return false;
    c.tags.forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    if (tag && c.tags.indexOf(tag) === -1) return false;
    return !q || (c.nl + ' ' + c.fr + ' ' + c.answer).toLowerCase().indexOf(q) !== -1;
  });
  offset = Math.max(0, Number(offset) || 0);
  limit = Math.min(200, Math.max(1, Number(limit) || 50));
  return { total: all.length, offset: offset, rows: all.slice(offset, offset + limit), counts: counts, tagCounts: tagCounts };
}

/** Kaarten: one cell per card, under the lock. */
function setCardCells_(ids, values) {
  return withLock_(function () {
    var sh = sheet_('Cards');
    var h = headersOf_(sh);
    Object.keys(values).forEach(function (k) { if (h.indexOf(k) === -1) throw new Error('Kolom ' + k + ' ontbreekt (setup draaien)'); });
    var done = [];
    (ids || []).forEach(function (id) {
      var row = findById_(sh, id);
      if (!row) return;
      Object.keys(values).forEach(function (k) { sh.getRange(row._row, h.indexOf(k) + 1).setValue(values[k]); });
      done.push(id);
    });
    return { done: done };
  });
}

/**
 * Kaarten: Goedkeuren ('approved') / Afkeuren ('rejected') / reset (''). Approving or rejecting also clears 🚩.
 * Approve refuses cards that fail validateCard_ (returned in `errors`).
 */
function reviewSetCheck(ids, value) {
  requireTeacher_();
  var v = value === 'approved' || value === 'rejected' ? CHECK_NL[value] : '';
  var errors = [];
  if (value === 'approved') {
    var sh = sheet_('Cards');
    ids = (ids || []).filter(function (id) {
      var row = findById_(sh, id);
      var e = row ? validateCard_(reviewRow_(row, false)) : [];
      if (e.length) errors.push({ id: id, errors: e });
      return !e.length;
    });
  }
  var res = setCardCells_(ids, { controle: v });
  res.errors = errors;
  return res;
}

function reviewSave(source, id, fields) {
  requireTeacher_();
  return withLock_(function () {
    var sh = sheet_(source === 'cards' ? 'Cards' : 'Inbox');
    var row = findById_(sh, id);
    if (!row) throw new Error('Rij niet gevonden (al verplaatst?)');
    if (source === 'cards' && fields && fields.tags !== undefined && !(Array.isArray(fields.tags) ? fields.tags : splitTags_(fields.tags)).length) {
      throw new Error('Een kaart heeft minstens één onderwerp nodig. Zonder onderwerp: Terug naar Inbox.');
    }
    return reviewRow_(writeFields_(sh, row, fields || {}), source !== 'cards');
  });
}

/** Goedkeuren: save the edits, validate, move the Inbox row to Cards (added = today, active). */
function reviewApprove(id, fields) {
  requireTeacher_();
  return withLock_(function () { return approveRow_(id, fields); });
}

/** The approve work itself (caller holds the lock). */
function approveRow_(id, fields) {
  {
    var inbox = sheet_('Inbox');
    var row = findById_(inbox, id);
    if (!row) throw new Error('Rij niet gevonden (al verplaatst?)');
    if (fields) row = writeFields_(inbox, row, fields);
    var c = reviewRow_(row, true);
    var errors = validateCard_(c);
    if (errors.length) return { ok: false, errors: errors };
    var cards = sheet_('Cards');
    var taken = !!findById_(cards, id);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var o = {};
    CARD_COLS.forEach(function (h) { o[h] = row[h]; });
    if (!o.id || taken) o.id = newId_('c_');
    o.added = today;
    o.active = true;
    o.controle = CHECK_NL.approved; // the teacher just reviewed it
    writeCardRows_(cards, [rowFromObject_(SCHEMA.Cards, o)]);
    inbox.deleteRow(row._row);
    return { ok: true, id: o.id };
  }
}

/** Keur alle goed: approves several Inbox rows in one go. */
function reviewApproveMany(ids) {
  requireTeacher_();
  return withLock_(function () {
    return (ids || []).map(function (id) {
      try {
        var row = findById_(sheet_('Inbox'), id);
        var r = approveRow_(id, null);
        return { id: id, ok: r.ok, errors: r.errors || [] };
      } catch (e) {
        return { id: id, ok: false, errors: [String(e.message || e)] };
      }
    });
  });
}


/** Afwijzen: delete the Inbox row. */
/** Verwijderen: deletes an Inbox row or a Cards row for good (her Progress/Log rows of that card stay, unused). */
function reviewDelete(source, id) {
  requireTeacher_();
  return withLock_(function () {
    var sh = sheet_(source === 'cards' ? 'Cards' : 'Inbox');
    var row = findById_(sh, id);
    if (!row) throw new Error('Rij niet gevonden (al verplaatst?)');
    sh.deleteRow(row._row);
    return { ok: true };
  });
}

function reviewReject(id) {
  requireTeacher_();
  return withLock_(function () {
    var inbox = sheet_('Inbox');
    var row = findById_(inbox, id);
    if (!row) throw new Error('Rij niet gevonden (al verplaatst?)');
    inbox.deleteRow(row._row);
    return { ok: true };
  });
}

/** Terug naar Inbox: move a card back (status voorgesteld; same id, so its progress returns if re-approved). */
function reviewCardToInbox(id, fields) {
  requireTeacher_();
  return withLock_(function () {
    var cards = sheet_('Cards');
    var row = findById_(cards, id);
    if (!row) throw new Error('Kaart niet gevonden');
    if (fields) row = writeFields_(cards, row, fields); // Afkeuren keeps the edits
    var inbox = sheet_('Inbox');
    var o = {};
    CARD_COLS.forEach(function (h) { o[h] = row[h]; });
    o.status = STATUS_NL.proposed;
    var start = nextRow_(inbox, 3);
    inbox.getRange(start, 1, 1, SCHEMA.Inbox.length).setValues([rowFromObject_(SCHEMA.Inbox, o)]);
    cards.deleteRow(row._row);
    return { ok: true };
  });
}
