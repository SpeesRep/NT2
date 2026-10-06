// Curriculum editor (teacher page ?page=curriculum, CurriculumPage.html). Same pattern as the review page: the browser
// calls the curriculumEditor* functions through google.script.run, each checks the teacher allowlist first; no
// tokens. Saving writes the WHOLE Curriculum tab at once inside LockService, after the shared validation
// (validateCurriculum_) and a version check; the previous table is kept in the hidden tab Curriculum_backup
// ("Ongedaan maken" puts it back once).
// The pure parts (curriculumVersion_, curriculumSavePlan_) are unit-tested in src/curriculumEditor.test.ts.

var CURRICULUM_BACKUP = 'Curriculum_backup';

/** Version stamp of the tab: a hash of its values (dates as YYYY-MM-DD). Changes whenever any cell changes. */
function curriculumVersion_(values) {
  var text = JSON.stringify(values.map(function (row) {
    return row.map(function (v) { return v instanceof Date ? isoDate_(v) : String(v === null || v === undefined ? '' : v); });
  }));
  var h = 5381;
  for (var i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36) + '.' + text.length;
}

/** Editor rows (list order) → {ok, checks:[{errors, warnings}], rows (normalised, order = position)}. Pure. */
function curriculumSavePlan_(rows, tagKeys, cardCounts) {
  var clean = (rows || []).map(function (r, i) {
    var pct = r.percentage === '' || r.percentage === null || r.percentage === undefined ? null : Number(r.percentage);
    return {
      order: r.order === undefined ? i + 1 : Number(r.order),
      tag: String(r.tag || '').trim().toLowerCase(),
      rule: ruleCode_(r.rule),
      date: String(r.date || '').trim(),
      percentage: pct === null || isNaN(pct) ? null : pct,
      from_tags: (Array.isArray(r.from_tags) ? r.from_tags : splitTags_(r.from_tags)).map(function (t) { return String(t).trim().toLowerCase(); })
        .filter(function (t, j, a) { return t && a.indexOf(t) === j; })
    };
  });
  var checks = validateCurriculum_(clean, tagKeys, cardCounts);
  var ok = checks.every(function (c) { return !c.errors.length; });
  return { ok: ok, checks: checks, rows: clean };
}

/** A row for the sheet: real Date in `datum` (the column has date validation), text in van_tags. */
function curriculumSheetValues_(r) {
  var v = curriculumRowToSheet_(r);
  if (validDate_(r.date)) { var p = r.date.split('-').map(Number); v[3] = new Date(p[0], p[1] - 1, p[2]); }
  return v;
}

function curriculumTabValues_(sh) {
  var last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, SCHEMA.Curriculum.length).getValues()
    .filter(function (r) { return r.some(function (c) { return c !== '' && c !== null; }); });
}

function writeCurriculumTab_(sh, values) {
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, SCHEMA.Curriculum.length).clearContent();
  if (values.length) sh.getRange(2, 1, values.length, SCHEMA.Curriculum.length).setValues(values);
}

function backupSheet_(ss) {
  var b = ss.getSheetByName(CURRICULUM_BACKUP);
  if (!b) {
    b = ss.insertSheet(CURRICULUM_BACKUP);
    b.getRange(1, 1, 1, SCHEMA.Curriculum.length).setValues([SCHEMA.Curriculum]);
    b.hideSheet();
  }
  return b;
}

function editorTagInfo_(ss) {
  var gate = bool_(readSettings_().require_approval), counts = {};
  readTable_(ss.getSheetByName('Cards')).rows.filter(function (r) { return cardServed_(r, gate); })
    .forEach(function (r) { splitTags_(r.tags).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
  var tags = readTable_(ss.getSheetByName('Tags')).rows.map(function (r) {
    var tag = String(r.tag).trim().toLowerCase();
    return { tag: tag, label: String(r.label_nl || tag), cards: counts[tag] || 0 };
  }).filter(function (t) { return t.tag; });
  return { tags: tags, counts: counts, keys: tags.map(function (t) { return t.tag; }) };
}

// ---------- called from the page (google.script.run) ----------

/**
 * Everything the editor needs: rows (by order), tags with label + active cards, today's score per tag (only when
 * the Progress tab has data), the bekend settings, the version stamp and whether a previous version exists.
 */
function curriculumEditorLoad() {
  requireTeacher_();
  var ss = ss_();
  var sh = ss.getSheetByName('Curriculum');
  var info = editorTagInfo_(ss);
  // Every subject belongs in the list: one without a row (e.g. added to the Tags tab by hand) is added as dicht now.
  var added = withLock_(function () { return appendMissingTopics_(sh, info.keys); });
  var settings = readSettings_();
  var known = { known_stability_days: Number(settings.known_stability_days), known_min_reviews: Number(settings.known_min_reviews) };
  var progress = readTable_(ss.getSheetByName('Progress')).rows.filter(function (r) { return r.card_id; });
  var scores = null;
  if (progress.length) {
    var status = curriculumNow_();
    scores = {};
    status.rows.forEach(function (s) { scores[s.tag] = s.score; s.fromScores.forEach(function (f) { scores[f.tag] = f.score; }); });
  }
  var rows = readCurriculum_().slice().sort(function (a, b) { return a.order - b.order; });
  var backup = ss.getSheetByName(CURRICULUM_BACKUP);
  return {
    env: env_(), today: isoDate_(new Date()), rows: rows, tags: info.tags, scores: scores, known: known,
    version: curriculumVersion_(curriculumTabValues_(sh)), hasBackup: !!backup && backup.getLastRow() > 1, added: added
  };
}

/** Appends a dicht row (order = last + 1) for every subject in `keys` without a Curriculum row. Returns the tags. */
function appendMissingTopics_(sh, keys) {
  var rows = readCurriculum_();
  var have = rows.map(function (r) { return r.tag; });
  var max = rows.reduce(function (m, r) { return Math.max(m, r.order || 0); }, 0);
  var add = keys.filter(function (k) { return have.indexOf(k) === -1; });
  if (!add.length) return [];
  var values = add.map(function (k, i) { return curriculumSheetValues_({ order: max + i + 1, tag: k, rule: 'closed', date: '', percentage: null, from_tags: [] }); });
  sh.getRange(nextRow_(sh, 2), 1, values.length, SCHEMA.Curriculum.length).setValues(values);
  SpreadsheetApp.flush();
  return add;
}

/**
 * Saves the editor's rows (list order). Nothing is written when there are errors or when the tab changed since
 * `version` was loaded. Returns {ok, checks} | {ok:false, conflict:true} | {ok:true, version, checks}.
 */
function curriculumEditorSave(rows, version, labels) {
  requireTeacher_();
  return withLock_(function () {
    var ss = ss_();
    var sh = ss.getSheetByName('Curriculum');
    var current = curriculumTabValues_(sh);
    if (curriculumVersion_(current) !== version) return { ok: false, conflict: true };
    var info = editorTagInfo_(ss);
    var plan = curriculumSavePlan_(rows, info.keys, info.counts);
    if (!plan.ok) return { ok: false, checks: plan.checks };
    // New names (Tags.label_nl) — the tag code stays, so every card keeps its subject.
    var tagsSh = ss.getSheetByName('Tags'), lc = headersOf_(tagsSh).indexOf('label_nl') + 1;
    readTable_(tagsSh).rows.forEach(function (r) {
      var k = String(r.tag).trim().toLowerCase(), v = labels && labels[k];
      if (v !== undefined && String(v).trim() && String(v).trim() !== String(r.label_nl)) tagsSh.getRange(r._row, lc).setValue(String(v).trim());
    });
    var b = backupSheet_(ss);
    writeCurriculumTab_(b, current);
    var values = plan.rows.map(curriculumSheetValues_);
    writeCurriculumTab_(sh, values);
    SpreadsheetApp.flush();
    try { updateCurriculumDashboard_(true); } catch (e) { /* the Dashboard must never block a save */ }
    return { ok: true, checks: plan.checks, version: curriculumVersion_(curriculumTabValues_(sh)) };
  });
}

/** "Ongedaan maken": puts back the table from before the last Opslaan (once: the backup is then emptied). Version-checked. */
function curriculumEditorUndo(version) {
  requireTeacher_();
  return withLock_(function () {
    var ss = ss_();
    var sh = ss.getSheetByName('Curriculum');
    var current = curriculumTabValues_(sh);
    if (curriculumVersion_(current) !== version) return { ok: false, conflict: true };
    var b = ss.getSheetByName(CURRICULUM_BACKUP);
    if (!b || b.getLastRow() < 2) return { ok: false, message: 'Er is geen vorige versie.' };
    var previous = curriculumTabValues_(b);
    writeCurriculumTab_(sh, previous);
    writeCurriculumTab_(b, []);
    SpreadsheetApp.flush();
    try { updateCurriculumDashboard_(true); } catch (e) { /* ignore */ }
    return { ok: true };
  });
}

/** "Nieuw onderwerp": a new Tags row (key a-z0-9-, label_nl, label_fr). It is not in the curriculum yet. */
function curriculumEditorNewTopic(tag, labelNl, labelFr, version) {
  requireTeacher_();
  var key = String(tag || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) throw new Error('Gebruik voor de code alleen a-z, 0-9 en -.');
  if (!String(labelNl || '').trim()) throw new Error('Vul een naam in.');
  return withLock_(function () {
    var sh = sheet_('Tags');
    var have = readTable_(sh).rows.map(function (r) { return String(r.tag).trim().toLowerCase(); });
    if (have.indexOf(key) !== -1) throw new Error('Onderwerp "' + key + '" bestaat al.');
    sh.getRange(nextRow_(sh, 1), 1, 1, SCHEMA.Tags.length).setValues([rowFromObject_(SCHEMA.Tags,
      { tag: key, label_nl: String(labelNl).trim(), label_fr: String(labelFr || '').trim(), description: '', subject_nl: '' })]);
    // Its Curriculum row (dicht) is written at once — no Opslaan needed. If the tab changed meanwhile, the page adds
    // the row itself and the next Opslaan stores it.
    var cur = sheet_('Curriculum');
    var same = curriculumVersion_(curriculumTabValues_(cur)) === version;
    if (same) appendMissingTopics_(cur, [key]);
    return { tag: key, label: String(labelNl).trim(), cards: 0, version: same ? curriculumVersion_(curriculumTabValues_(cur)) : null };
  });
}

/**
 * Verwijderen (a subject): removes the tag from Cards and Inbox, its Curriculum row, the tag from other rows'
 * van_tags, and its Tags row. Cards left WITHOUT any subject go to the Inbox (every card needs a subject).
 * dryRun (default true) only counts, for the confirm question. Version-checked like Opslaan.
 */
function curriculumEditorDeleteTopic(tag, version, dryRun) {
  requireTeacher_();
  var key = String(tag || '').trim().toLowerCase();
  return withLock_(function () {
    var ss = ss_();
    var cur = ss.getSheetByName('Curriculum');
    if (curriculumVersion_(curriculumTabValues_(cur)) !== version) return { ok: false, conflict: true };
    var studied = {};
    readTable_(ss.getSheetByName('Progress')).rows.forEach(function (r) { if (r.card_id) studied[String(r.card_id)] = true; });
    var cards = ss.getSheetByName('Cards'), ct = readTable_(cards), ccol = ct.headers.indexOf('tags') + 1;
    var tagged = ct.rows.filter(function (r) { return splitTags_(r.tags).indexOf(key) !== -1; });
    var toInbox = tagged.filter(function (r) { return splitTags_(r.tags).length === 1; });
    var inbox = ss.getSheetByName('Inbox'), it = readTable_(inbox), icol = it.headers.indexOf('tags') + 1;
    var inboxTagged = it.rows.filter(function (r) { return splitTags_(r.tags).indexOf(key) !== -1; });
    var curRows = readCurriculum_();
    var waiting = curRows.filter(function (r) { return r.from_tags.indexOf(key) !== -1; }).map(function (r) { return r.tag; });
    var report = {
      ok: true, dryRun: dryRun !== false, tag: key, cards: tagged.length, toInbox: toInbox.length,
      studiedToInbox: toInbox.filter(function (r) { return studied[String(r.id)]; }).length, inbox: inboxTagged.length, waiting: waiting
    };
    if (dryRun !== false) return report;
    var without = function (r) { return splitTags_(r.tags).filter(function (t) { return t !== key; }).join(', '); };
    tagged.forEach(function (r) { if (toInbox.indexOf(r) === -1) cards.getRange(r._row, ccol).setValue(without(r)); });
    inboxTagged.forEach(function (r) { inbox.getRange(r._row, icol).setValue(without(r)); });
    if (toInbox.length) {
      var moved = toInbox.map(function (r) {
        var o = {}; CARD_COLS.forEach(function (h) { o[h] = r[h]; }); o.tags = ''; o.status = STATUS_NL.proposed;
        return rowFromObject_(SCHEMA.Inbox, o);
      });
      inbox.getRange(nextRow_(inbox, 3), 1, moved.length, SCHEMA.Inbox.length).setValues(moved);
      toInbox.slice().sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { cards.deleteRow(r._row); });
    }
    var rows = curRows.filter(function (r) { return r.tag !== key; }).map(function (r) {
      r.from_tags = r.from_tags.filter(function (t) { return t !== key; });
      return r;
    }).sort(function (a, b) { return a.order - b.order; });
    writeCurriculumTab_(cur, rows.map(curriculumSheetValues_));
    var tags = ss.getSheetByName('Tags');
    readTable_(tags).rows.filter(function (r) { return String(r.tag).trim().toLowerCase() === key; })
      .sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { tags.deleteRow(r._row); });
    SpreadsheetApp.flush();
    try { updateCurriculumDashboard_(true); } catch (e) { /* ignore */ }
    return report;
  });
}
