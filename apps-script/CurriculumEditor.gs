// Curriculum editor (owner page ?page=curriculum, CurriculumPage.html). The browser calls the curriculumEditor*
// functions through google.script.run, each checks the allowlist first; no tokens. Saving replaces the open GROUP's
// rows in one write inside LockService, after the shared validation (validateCurriculum_) and a version check; the
// group's previous rows are kept in the hidden tab Curriculum_backup ("Ongedaan maken" puts them back once).
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

// v2: the Curriculum tab holds every group's rows (group_code). The owner page edits ONE group (defaultGroup_()
// until there is a group picker); every helper below reads and writes only that group's rows.

/** Index of a Curriculum column (a function, not a top-level var: Apps Script does not order file loading). */
function curCol_(name) { return SCHEMA.Curriculum.indexOf(name); }

/** A row for the sheet: real Date in `datum` (the column has date validation), text in van_tags. */
function curriculumSheetValues_(r, groupCode, version) {
  var v = curriculumRowToSheet_(r, groupCode, version);
  if (validDate_(r.date)) { var p = r.date.split('-').map(Number); v[curCol_('datum')] = new Date(p[0], p[1] - 1, p[2]); }
  return v;
}

function allCurriculumValues_(sh) {
  var last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, SCHEMA.Curriculum.length).getValues()
    .filter(function (r) { return r.some(function (c) { return c !== '' && c !== null; }); });
}

/** That group's rows as sheet values, without the version column (so the stamp only changes with the content). */
function curriculumTabValues_(sh, groupCode) {
  return allCurriculumValues_(sh).filter(function (r) { return String(r[curCol_('group_code')]).trim() === groupCode; })
    .map(function (r) { return r.filter(function (c, i) { return i !== curCol_('version'); }); });
}

/** The group's current version number (max of its rows; 0 when none). */
function curriculumVersionNumber_(sh, groupCode) {
  return allCurriculumValues_(sh).filter(function (r) { return String(r[curCol_('group_code')]).trim() === groupCode; })
    .reduce(function (m, r) { return Math.max(m, Number(r[curCol_('version')]) || 0); }, 0);
}

/** Replaces the group's rows by `values` (full sheet rows), keeping every other group's rows. */
function writeCurriculumTab_(sh, values, groupCode) {
  var keep = allCurriculumValues_(sh).filter(function (r) { return String(r[curCol_('group_code')]).trim() !== groupCode; });
  var all = keep.concat(values);
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, SCHEMA.Curriculum.length).clearContent();
  if (all.length) sh.getRange(2, 1, all.length, SCHEMA.Curriculum.length).setValues(all);
}

/** Hidden tab with the group's rows from before the last Opslaan (for "Ongedaan maken"). */
function backupSheet_(ss) {
  var b = ss.getSheetByName(CURRICULUM_BACKUP);
  if (!b) {
    b = ss.insertSheet(CURRICULUM_BACKUP);
    b.getRange(1, 1, 1, SCHEMA.Curriculum.length).setValues([SCHEMA.Curriculum]);
    b.hideSheet();
  }
  return b;
}

/** Tags with label and the number of cards this group gets (approved + accepted) per tag. */
function editorTagInfo_(ss, groupCode) {
  var accepted = readGroupCards_()[groupCode] || {}, counts = {};
  readTable_(ss.getSheetByName('Cards')).rows
    .filter(function (r) { return cardServed_(r) && accepted[String(r.id)] === 'accepted'; })
    .forEach(function (r) { splitTags_(r.tags).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
  var tags = readTable_(ss.getSheetByName('Tags')).rows.map(function (r) {
    var tag = String(r.tag).trim().toLowerCase();
    return { tag: tag, label: String(r.label_nl || tag), cards: counts[tag] || 0 };
  }).filter(function (t) { return t.tag; });
  return { tags: tags, counts: counts, keys: tags.map(function (t) { return t.tag; }) };
}

// ---------- called from the page (google.script.run) ----------

/**
 * Everything the editor needs: the group, its rows (by order), tags with label + cards, the bekend settings and
 * the version stamp. No scores: progress exists only on the students' devices.
 */
function curriculumEditorLoad() {
  requireTeacher_();
  var ss = ss_(), group = defaultGroup_(), code = group.group_code;
  var sh = ss.getSheetByName('Curriculum');
  var info = editorTagInfo_(ss, code);
  // Every subject belongs in the list: one without a row (e.g. added to the Tags tab by hand) is added as dicht now.
  var added = withLock_(function () { return appendMissingTopics_(sh, info.keys, code); });
  var settings = readSettings_();
  var known = { known_stability_days: Number(settings.known_stability_days), known_min_reviews: Number(settings.known_min_reviews) };
  var rows = readCurriculum_(code).slice().sort(function (a, b) { return a.order - b.order; });
  var backup = ss.getSheetByName(CURRICULUM_BACKUP);
  return {
    env: env_(), group: { code: code, name: group.display_name }, today: isoDate_(new Date()), rows: rows, tags: info.tags,
    scores: null, known: known, version: curriculumVersion_(curriculumTabValues_(sh, code)),
    hasBackup: !!backup && curriculumTabValues_(backup, code).length > 0, added: added
  };
}

/** Appends a dicht row (order = last + 1) for every subject in `keys` without a row in this group. Returns the tags. */
function appendMissingTopics_(sh, keys, groupCode) {
  var rows = readCurriculum_(groupCode);
  var have = rows.map(function (r) { return r.tag; });
  var max = rows.reduce(function (m, r) { return Math.max(m, r.order || 0); }, 0);
  var add = keys.filter(function (k) { return have.indexOf(k) === -1; });
  if (!add.length) return [];
  var version = Math.max(curriculumVersionNumber_(sh, groupCode), 1);
  var values = add.map(function (k, i) {
    return curriculumSheetValues_({ order: max + i + 1, tag: k, rule: 'closed', date: '', percentage: null, from_tags: [] }, groupCode, version);
  });
  sh.getRange(Math.max(sh.getLastRow() + 1, 2), 1, values.length, SCHEMA.Curriculum.length).setValues(values);
  SpreadsheetApp.flush();
  return add;
}

/**
 * Saves the editor's rows (list order) for the group. Nothing is written when there are errors or when the group's
 * rows changed since `version` was loaded. Returns {ok, checks} | {ok:false, conflict:true} | {ok:true, version, checks}.
 */
function curriculumEditorSave(rows, version, labels) {
  requireTeacher_();
  return withLock_(function () {
    var ss = ss_(), code = defaultGroup_().group_code;
    var sh = ss.getSheetByName('Curriculum');
    var current = curriculumTabValues_(sh, code);
    if (curriculumVersion_(current) !== version) return { ok: false, conflict: true };
    var info = editorTagInfo_(ss, code);
    var plan = curriculumSavePlan_(rows, info.keys, info.counts);
    if (!plan.ok) return { ok: false, checks: plan.checks };
    // New names (Tags.label_nl) — the tag code stays, so every card keeps its subject.
    var tagsSh = ss.getSheetByName('Tags'), lc = headersOf_(tagsSh).indexOf('label_nl') + 1;
    readTable_(tagsSh).rows.forEach(function (r) {
      var k = String(r.tag).trim().toLowerCase(), v = labels && labels[k];
      if (v !== undefined && String(v).trim() && String(v).trim() !== String(r.label_nl)) tagsSh.getRange(r._row, lc).setValue(String(v).trim());
    });
    var next = curriculumVersionNumber_(sh, code) + 1;
    var b = backupSheet_(ss);
    writeCurriculumTab_(b, allCurriculumValues_(sh).filter(function (r) { return String(r[curCol_('group_code')]).trim() === code; }), code);
    writeCurriculumTab_(sh, plan.rows.map(function (r) { return curriculumSheetValues_(r, code, next); }), code);
    SpreadsheetApp.flush();
    return { ok: true, checks: plan.checks, version: curriculumVersion_(curriculumTabValues_(sh, code)) };
  });
}

/** "Ongedaan maken": puts back the group's rows from before the last Opslaan (once). Version-checked. */
function curriculumEditorUndo(version) {
  requireTeacher_();
  return withLock_(function () {
    var ss = ss_(), code = defaultGroup_().group_code;
    var sh = ss.getSheetByName('Curriculum');
    if (curriculumVersion_(curriculumTabValues_(sh, code)) !== version) return { ok: false, conflict: true };
    var b = ss.getSheetByName(CURRICULUM_BACKUP);
    var previous = b ? allCurriculumValues_(b).filter(function (r) { return String(r[curCol_('group_code')]).trim() === code; }) : [];
    if (!previous.length) return { ok: false, message: 'Er is geen vorige versie.' };
    var next = curriculumVersionNumber_(sh, code) + 1;
    writeCurriculumTab_(sh, previous.map(function (r) { var c = r.slice(); c[curCol_('version')] = next; return c; }), code);
    writeCurriculumTab_(b, [], code);
    SpreadsheetApp.flush();
    return { ok: true };
  });
}

/** "Nieuw onderwerp": a new Tags row (key a-z0-9-, label_nl, label_fr). Its Curriculum row (dicht) is added at once. */
function curriculumEditorNewTopic(tag, labelNl, labelFr, version) {
  requireTeacher_();
  var key = String(tag || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) throw new Error('Gebruik voor de code alleen a-z, 0-9 en -.');
  if (!String(labelNl || '').trim()) throw new Error('Vul een naam in.');
  return withLock_(function () {
    var sh = sheet_('Tags'), code = defaultGroup_().group_code;
    var have = readTable_(sh).rows.map(function (r) { return String(r.tag).trim().toLowerCase(); });
    if (have.indexOf(key) !== -1) throw new Error('Onderwerp "' + key + '" bestaat al.');
    sh.getRange(nextRow_(sh, 1), 1, 1, SCHEMA.Tags.length).setValues([rowFromObject_(SCHEMA.Tags,
      { tag: key, label_nl: String(labelNl).trim(), label_fr: String(labelFr || '').trim(), description: '', subject_nl: '' })]);
    var cur = sheet_('Curriculum');
    var same = curriculumVersion_(curriculumTabValues_(cur, code)) === version;
    if (same) appendMissingTopics_(cur, [key], code);
    return { tag: key, label: String(labelNl).trim(), cards: 0, version: same ? curriculumVersion_(curriculumTabValues_(cur, code)) : null };
  });
}

/**
 * Verwijderen (a subject) — affects the SHARED bank and every group: removes the tag from Cards, its Curriculum rows
 * (all groups), the tag from other rows' van_tags, and its Tags row. Cards left without any subject become drafts
 * (every card needs a subject). dryRun (default true) only counts. Version-checked for the open group.
 */
function curriculumEditorDeleteTopic(tag, version, dryRun) {
  requireTeacher_();
  var key = String(tag || '').trim().toLowerCase();
  return withLock_(function () {
    var ss = ss_(), code = defaultGroup_().group_code;
    var cur = ss.getSheetByName('Curriculum');
    if (curriculumVersion_(curriculumTabValues_(cur, code)) !== version) return { ok: false, conflict: true };
    var cards = ss.getSheetByName('Cards'), ct = readTable_(cards);
    var tcol = ct.headers.indexOf('tags') + 1, scol = ct.headers.indexOf('status') + 1;
    var tagged = ct.rows.filter(function (r) { return splitTags_(r.tags).indexOf(key) !== -1; });
    var toDraft = tagged.filter(function (r) { return splitTags_(r.tags).length === 1; });
    var all = allCurriculumValues_(cur);
    var VT = curCol_('van_tags'), TG = curCol_('tag');
    var waiting = all.filter(function (r) { return splitTags_(r[VT]).indexOf(key) !== -1; }).map(function (r) { return r[TG]; });
    var groups = all.filter(function (r) { return String(r[TG]).trim().toLowerCase() === key; }).map(function (r) { return r[curCol_('group_code')]; });
    var report = { ok: true, dryRun: dryRun !== false, tag: key, cards: tagged.length, toInbox: toDraft.length, studiedToInbox: 0,
      inbox: 0, waiting: waiting, groups: groups };
    if (dryRun !== false) return report;
    tagged.forEach(function (r) {
      cards.getRange(r._row, tcol).setValue(splitTags_(r.tags).filter(function (t) { return t !== key; }).join(', '));
      if (toDraft.indexOf(r) !== -1) cards.getRange(r._row, scol).setValue('draft');
    });
    var kept = all.filter(function (r) { return String(r[TG]).trim().toLowerCase() !== key; }).map(function (r) {
      var c = r.slice(); c[VT] = splitTags_(r[VT]).filter(function (t) { return t !== key; }).join(', '); return c;
    });
    var last = cur.getLastRow();
    if (last >= 2) cur.getRange(2, 1, last - 1, SCHEMA.Curriculum.length).clearContent();
    if (kept.length) cur.getRange(2, 1, kept.length, SCHEMA.Curriculum.length).setValues(kept);
    var tags = ss.getSheetByName('Tags');
    readTable_(tags).rows.filter(function (r) { return String(r.tag).trim().toLowerCase() === key; })
      .sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { tags.deleteRow(r._row); });
    SpreadsheetApp.flush();
    return report;
  });
}
