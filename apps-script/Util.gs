// Shared helpers.

function props_() {
  return PropertiesService.getScriptProperties();
}

function env_() {
  return props_().getProperty('ENV') || SECRETS.ENV || '';
}

function ss_() {
  var id = props_().getProperty('SHEET_ID');
  if (!id) throw apiError_('not_setup', 'Run setup() first.');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw apiError_('missing_tab', 'Missing tab ' + name);
  return sh;
}

function apiError_(code, message) {
  var err = new Error(message || code);
  err.apiCode = code;
  return err;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function newId_(prefix) {
  return (prefix || 'c_') + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

function tz_() {
  return Session.getScriptTimeZone() || 'Europe/Brussels';
}

function isoDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return v == null ? '' : String(v);
}

function isoDateTime_(v) {
  if (v instanceof Date) return v.toISOString();
  return v == null ? '' : String(v);
}

function toDate_(v) {
  if (v instanceof Date) return v;
  if (v === '' || v == null) return '';
  var d = new Date(typeof v === 'number' ? v : String(v));
  return isNaN(d.getTime()) ? '' : d;
}

function bool_(v) {
  if (typeof v === 'boolean') return v;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'vrai' || s === '1' || s === 'yes' || s === 'oui';
}

/** Reads a tab into {headers, rows:[{...,_row}]}; _row is the 1-based sheet row. */
function readTable_(sh) {
  var values = sh.getDataRange().getValues();
  var headers = values.shift().map(String);
  var rows = [];
  values.forEach(function (r, i) {
    if (r.every(function (c) { return c === '' || c === null || c === false; })) return;
    var o = { _row: i + 2 };
    headers.forEach(function (h, j) { o[h] = r[j]; });
    rows.push(o);
  });
  return { headers: headers, rows: rows };
}

function rowFromObject_(headers, obj) {
  return headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; });
}

function splitTags_(s) {
  return String(s || '').split(',').map(function (t) { return t.trim().toLowerCase(); })
    .filter(function (t) { return t; });
}

function safeEquals_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 'admin' | 'learner' | null */
function roleFor_(token) {
  var p = props_();
  if (safeEquals_(token, p.getProperty('ADMIN_TOKEN'))) return 'admin';
  if (safeEquals_(token, p.getProperty('LEARNER_TOKEN'))) return 'learner';
  return null;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw apiError_('busy', 'Try again in a moment.');
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

/** 1-based row after the last row whose column `col` (1-based) has content. Ignores checkbox-only rows. */
function nextRow_(sh, col) {
  var last = sh.getLastRow();
  if (last < 2) return 2;
  var vals = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (vals[i][0] !== '' && vals[i][0] !== null && vals[i][0] !== false) return i + 3;
  }
  return 2;
}

// ---------- Dutch sheet values ↔ internal codes ----------
// The sheet is in Dutch; the API speaks fixed codes. Both spellings are accepted when reading.
var TYPE_NL = { word: 'dubbel', oneway: 'enkel', sentence: 'zin', question: 'vraag' };
var TYPE_ALIASES = { woord: 'word', calc: 'oneway' }; // older sheet values, still read
var STATUS_NL = { proposed: 'voorgesteld', approved: 'goedgekeurd' };
var CHECK_NL = { approved: 'goedgekeurd', rejected: 'afgekeurd' }; // Cards.controle ('' = not checked yet)
var CHECK_ALIASES = { gecontroleerd: 'approved' }; // value of the first version (2026-10-02)

/** Cards.controle → 'approved' | 'rejected' | ''. */
function checkCode_(v) {
  var s = String(v || '').trim().toLowerCase();
  if (CHECK_NL[s]) return s;
  return invert_(CHECK_NL)[s] || CHECK_ALIASES[s] || '';
}

/** Does this Cards row go to the learner's app? Active, and approved when Settings.require_approval is on. */
function cardServed_(r, requireApproval) {
  return !!(String(r.id).trim() && bool_(r.active) && String(r.nl).trim() && (!requireApproval || checkCode_(r.controle) === 'approved'));
}
// Old English tag keys → Dutch keys (used by the one-time migration and to convert seed lines).
var TAG_RENAME = { household: 'huishouden', family: 'familie', travel: 'reizen', food: 'eten', work: 'werk',
  health: 'gezondheid', shopping: 'winkelen', time: 'tijd' };
// Seed/old English part-of-speech values → Dutch.
var POS_NL = {
  'noun': 'zelfstandig naamwoord', 'noun (plural)': 'zelfstandig naamwoord (meervoud)', 'verb': 'werkwoord',
  'verb (separable)': 'scheidbaar werkwoord', 'adj': 'bijvoeglijk naamwoord', 'adv': 'bijwoord',
  'det': 'voornaamwoord', 'phrase': 'uitdrukking', 'sentence': 'zin', 'question': 'vraag',
  'num': 'telwoord', 'prep': 'voorzetsel', 'noun (time)': 'zelfstandig naamwoord', 'adj/time': 'bijvoeglijk naamwoord',
  'prep (time)': 'voorzetsel', 'calc': 'klok'
};

function invert_(o) {
  var r = {};
  Object.keys(o).forEach(function (k) { r[o[k]] = k; });
  return r;
}

/** Sheet value (Dutch or English) → code: 'word' | 'sentence' | 'question' ('' if unknown). */
function typeCode_(v) {
  var s = String(v || '').trim().toLowerCase();
  if (TYPE_NL[s]) return s;
  return invert_(TYPE_NL)[s] || TYPE_ALIASES[s] || '';
}

/** Sheet value → 'manual' | 'auto' | ''. */

/** Inbox status (Dutch or English) → 'proposed' | 'approved' | ''. */
function statusCode_(v) {
  var s = String(v || '').trim().toLowerCase();
  if (STATUS_NL[s]) return s;
  return invert_(STATUS_NL)[s] || '';
}

function typeNl_(code) { return TYPE_NL[typeCode_(code)] || String(code || ''); }
function posNl_(v) { var s = String(v || '').trim(); return POS_NL[s.toLowerCase()] || s; }
function tagsNl_(v) {
  return splitTags_(v).map(function (t) { return TAG_RENAME[t] || t; }).join(', ');
}
