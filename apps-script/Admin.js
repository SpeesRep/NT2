// Admin-only actions (ADMIN_TOKEN). Used by the /retag, /addwords and /promote commands.

function adminListCards_() {
  return { cards: readTable_(sheet_('Cards')).rows.filter(function (r) { return r.id; }).map(cardToJson_) };
}

function adminListUntagged_() {
  var cards = readTable_(sheet_('Cards')).rows.filter(function (r) {
    return r.id && bool_(r.active) && splitTags_(r.tags).length === 0;
  }).map(cardToJson_);
  return { cards: cards };
}

/** Lists tags; optionally appends new ones: add = [{tag, label_fr, description}]. */
function adminTags_(add) {
  var sh = sheet_('Tags');
  var added = [];
  if (Array.isArray(add) && add.length) {
    withLock_(function () {
      var existing = readTable_(sh).rows.map(function (r) { return String(r.tag).trim().toLowerCase(); });
      add.forEach(function (t) {
        var tag = String(t && t.tag || '').trim().toLowerCase();
        if (!/^[a-z0-9-]{2,30}$/.test(tag) || existing.indexOf(tag) !== -1) return;
        var row = {}; row.tag = tag; row.label_nl = String(t.label_nl || tag); row.label_fr = String(t.label_fr || '');
        row.description = String(t.description || '');
        sh.getRange(nextRow_(sh, 1), 1, 1, SCHEMA.Tags.length).setValues([rowFromObject_(SCHEMA.Tags, row)]);
        existing.push(tag);
        added.push(tag);
      });
    });
  }
  var tags = readTable_(sh).rows.map(function (r) {
    return { tag: String(r.tag).trim().toLowerCase(), label_nl: String(r.label_nl || ''), label_fr: String(r.label_fr || ''), description: String(r.description || '') };
  }).filter(function (x) { return x.tag; });
  return { tags: tags, added: added };
}

/** updates = [{id, tags: [..]}] (Cards; at most 3 tags, each from the Tags tab). */
function adminSetTags_(updates) {
  if (!Array.isArray(updates)) throw apiError_('bad_request', 'updates[] required');
  return withLock_(function () {
    var sh = sheet_('Cards');
    var t = readTable_(sh);
    var known = readTable_(sheet_('Tags')).rows.map(function (r) { return String(r.tag).trim().toLowerCase(); });
    var byId = {};
    t.rows.forEach(function (r) { byId[String(r.id)] = r; });
    var tagsCol = t.headers.indexOf('tags') + 1;
    var updated = [], skipped = [];
    updates.forEach(function (u) {
      var r = byId[String(u && u.id)];
      if (!r) { skipped.push({ id: u && u.id, reason: 'not_found' }); return; }
      var tags = (u.tags || []).map(function (x) { return String(x).trim().toLowerCase(); }).filter(function (x) { return x; });
      var unknown = tags.filter(function (x) { return known.indexOf(x) === -1; });
      if (unknown.length) { skipped.push({ id: r.id, reason: 'unknown_tags:' + unknown.join(',') }); return; }
      if (tags.length > 3) { skipped.push({ id: r.id, reason: 'too_many_tags' }); return; }
      sh.getRange(r._row, tagsCol).setValue(tags.join(', '));
      updated.push(r.id);
    });
    return { updated: updated, skipped: skipped };
  });
}

/**
 * rows = [{type, nl, article, pos, fr, example_nl, example_fr, tags, flags}] → Inbox, status=proposed.
 */
function adminAppendInbox_(rows) {
  if (!Array.isArray(rows) || !rows.length) throw apiError_('bad_request', 'rows[] required');
  return withLock_(function () {
    var sh = sheet_('Inbox');
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var headers = SCHEMA.Inbox;
    // Idempotent: skip anything whose (type, nl, article) already exists in Cards or Inbox. The article is part
    // of the key so homographs stay apart ("het haar" ≠ "haar").
    var key = function (type, nl, article) {
      return (typeCode_(type) || 'word') + '|' + String(nl || '').trim().toLowerCase() + '|' + String(article || '').trim().toLowerCase();
    };
    var seen = {};
    readTable_(sheet_('Cards')).rows.concat(readTable_(sh).rows)
      .forEach(function (r) { if (r.nl) seen[key(r.type, r.nl, r.article)] = true; });
    var skipped = [];
    rows = rows.filter(function (r) {
      var k = key(r.type, r.nl, r.article);
      if (!String(r.nl || '').trim() || seen[k]) { skipped.push(r.nl); return false; }
      seen[k] = true;
      return true;
    });
    if (!rows.length) return { appended: 0, skipped: skipped };
    var out = rows.map(function (r) {
      var tags = Array.isArray(r.tags) ? r.tags.join(', ') : String(r.tags || '');
      var flags = Array.isArray(r.flags) ? r.flags.join(', ') : String(r.flags || '');
      return rowFromObject_(headers, {
        id: newId_('c_'), type: typeNl_(typeCode_(r.type) || 'word'), nl: String(r.nl || ''),
        article: r.article === 'de' || r.article === 'het' ? r.article : '', pos: posNl_(r.pos),
        fr: String(r.fr || ''), example_nl: String(r.example_nl || ''), example_fr: String(r.example_fr || ''),
        answer: String(r.answer || ''),
        tags: tagsNl_(tags), flags: flags,
        added: today, active: true, status: STATUS_NL.proposed
      });
    });
    sh.getRange(nextRow_(sh, 3), 1, out.length, headers.length).setValues(out);
    return { appended: out.length, skipped: skipped };
  });
}

function adminListInbox_() {
  return {
    rows: readTable_(sheet_('Inbox')).rows.filter(function (r) { return r.nl; }).map(function (r) {
      var c = cardToJson_(r); c.status = statusCode_(r.status) || String(r.status || ''); return c;
    })
  };
}

/** Moves every status=approved Inbox row into Cards (added = today, active, controle goedgekeurd). */
function adminPromoteInbox_() {
  return withLock_(function () {
    var inbox = sheet_('Inbox');
    var cards = sheet_('Cards');
    var t = readTable_(inbox);
    var approved = t.rows.filter(function (r) { return statusCode_(r.status) === 'approved' && String(r.nl).trim(); });
    if (!approved.length) return { promoted: [] };
    var existingIds = {};
    readTable_(cards).rows.forEach(function (r) { existingIds[String(r.id)] = true; });
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var rows = approved.map(function (r) {
      var o = {};
      CARD_COLS.forEach(function (h) { o[h] = r[h]; });
      if (!o.id || existingIds[String(o.id)]) o.id = newId_('c_');
      o.added = today;
      o.active = true;
      o.controle = CHECK_NL.approved; // the teacher approved it in the Inbox
      return rowFromObject_(SCHEMA.Cards, o);
    });
    cards.getRange(nextRow_(cards, 3), 1, rows.length, SCHEMA.Cards.length).setValues(rows);
    approved.map(function (r) { return r._row; }).sort(function (a, b) { return b - a; })
      .forEach(function (n) { inbox.deleteRow(n); });
    return { promoted: rows.map(function (r) { return { id: r[0], nl: r[2], fr: r[5] }; }) };
  });
}

/** Rewrites Progress from the latest Log snapshot per (card_id, track). */
function adminRebuildProgress_() {
  return withLock_(function () {
    var latest = {}, first = {};
    readTable_(sheet_('Log')).rows.forEach(function (r) {
      var key = r.card_id + '|' + r.track;
      var ts = toDate_(r.ts);
      if (!ts) return;
      if (!first[key] || ts < first[key]) first[key] = ts;
      if (latest[key] && latest[key].ts >= ts) return;
      var snap;
      try { snap = JSON.parse(r.snapshot); } catch (e) { return; }
      latest[key] = { ts: ts, card_id: String(r.card_id), track: String(r.track), s: snap, first: first[key] };
    });
    var rows = Object.keys(latest).map(function (k) {
      var x = latest[k];
      return [x.card_id, x.track, x.s.state, new Date(x.s.due), x.s.stability, x.s.difficulty, x.s.reps, x.s.lapses, x.ts, first[k]];
    });
    var sh = sheet_('Progress');
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, SCHEMA.Progress.length).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, SCHEMA.Progress.length).setValues(rows);
    return { rows: rows.length };
  });
}

/** Raw values of one tab (for debugging and the slash commands). */
function adminReadTab_(tab, rows) {
  if (!SCHEMA[tab]) throw apiError_('bad_request', 'Unknown tab ' + tab);
  var sh = sheet_(tab);
  var last = rows ? Math.min(Number(rows), sh.getMaxRows()) : Math.max(nextRow_(sh, 1), nextRow_(sh, 3)) - 1;
  var values = last >= 1 ? sh.getRange(1, 1, last, sh.getLastColumn()).getValues() : [];
  return { lastRow: sh.getLastRow(), values: values };
}

/** DEV only: wipes Cards and re-inserts the seed data. */
function adminReseedDev_() {
  if (env_() !== 'DEV') throw apiError_('forbidden', 'reseedDev only runs on DEV');
  return withLock_(function () {
    var sh = sheet_('Cards');
    if (sh.getMaxRows() > 1) sh.getRange(2, 1, sh.getMaxRows() - 1, CARD_COLS.length).clearContent();
    seedCards_(sh);
    seedAppWords_(sh);
    applyCardValidation_(sh, false);
    return { rows: nextRow_(sh, 3) - 2 };
  });
}

/** Removes rows written by scripts/smoke.sh (card_id __smoke__) from Log and Progress. */
function adminPurgeSmoke_() {
  return withLock_(function () {
    var removed = 0;
    ['Log', 'Progress'].forEach(function (tab) {
      var sh = sheet_(tab);
      readTable_(sh).rows.filter(function (r) { return String(r.card_id) === '__smoke__'; })
        .map(function (r) { return r._row; }).sort(function (a, b) { return b - a; })
        .forEach(function (n) { sh.deleteRow(n); removed++; });
    });
    return { removed: removed };
  });
}

/** Changes one field of one Curriculum row (by tag). Fields: order, regel, datum, percentage, van_tags. */
function adminSetCurriculum_(tag, field, value) {
  var allowed = ['order', 'regel', 'datum', 'percentage', 'van_tags'];
  if (allowed.indexOf(field) === -1) throw apiError_('bad_request', 'field must be one of ' + allowed.join(', '));
  return withLock_(function () {
    var sh = sheet_('Curriculum');
    var t = readTable_(sh);
    var row = t.rows.filter(function (r) { return String(r.tag).trim().toLowerCase() === String(tag || '').trim().toLowerCase(); })[0];
    if (!row) throw apiError_('not_found', 'No Curriculum row for tag ' + tag);
    var v = field === 'regel' ? (RULE_NL[ruleCode_(value)] || String(value)) :
      field === 'van_tags' ? (Array.isArray(value) ? value.join(', ') : String(value || '')) :
      field === 'datum' ? String(value || '') : (value === '' || value === null ? '' : Number(value));
    sh.getRange(row._row, t.headers.indexOf(field) + 1).setValue(v);
    updateCurriculumDashboard_(true);
    return { tag: tag, field: field, value: v };
  });
}

/**
 * Old Curriculum tab (unlock_threshold … open) → the new one (order, tag, regel, datum, percentage, van_tags),
 * see migrateCurriculumRows_ + CURRICULUM_MIGRATION_SEED. Also removes the unused Progress.first_review column
 * and the old Settings rows (mature_stability_days, curriculum_only; adds known_*). Topics with 0 active cards become
 * dicht (other columns kept); a bekend row waiting on one of them waits on the nearest topic above it with cards.
 * Dry run unless dryRun:false.
 */
function adminMigrateCurriculum_(dryRun) {
  return withLock_(function () {
    var ss = ss_();
    var cur = ss.getSheetByName('Curriculum');
    var t = readTable_(cur);
    if (t.headers.indexOf('unlock_threshold') === -1) return { dryRun: dryRun, already: true, rows: readCurriculum_().map(curriculumRowToSheet_) };
    var old = t.rows.filter(function (r) { return String(r.tag).trim(); }).map(function (r) {
      var o = String(r.open || '').trim().toLowerCase();
      return {
        order: Number(r.order) || 0, tag: String(r.tag).trim().toLowerCase(),
        unlock_threshold: r.unlock_threshold === '' ? 0.8 : Number(r.unlock_threshold),
        max_wait_days: r.max_wait_days === '' || r.max_wait_days === null ? null : Number(r.max_wait_days),
        active: r.active === '' ? true : bool_(r.active),
        open: o === 'altijd open' || o === 'always' ? 'always' : o === 'dicht' || o === 'closed' ? 'closed' : 'auto'
      };
    });
    var m = migrateCurriculumRows_(old);
    var seeded = [];
    m.rows.forEach(function (r) {
      var s = CURRICULUM_MIGRATION_SEED[r.tag];
      if (!s) return;
      var before = curriculumRowToSheet_(r).slice(2).join(' | ');
      r.rule = s.rule; r.percentage = s.percentage || null; r.from_tags = s.from_tags || []; r.date = '';
      var after = curriculumRowToSheet_(r).slice(2).join(' | ');
      if (before !== after) seeded.push(r.tag + ': ' + before + '  →  ' + after);
    });
    // Topics without active cards are parked as dicht (teacher, 2026-10-05); their other columns are kept.
    var gate = bool_(readSettings_().require_approval), counts = {};
    readTable_(ss.getSheetByName('Cards')).rows.filter(function (r) { return cardServed_(r, gate); })
      .forEach(function (r) { splitTags_(r.tags).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var emptyToDicht = [];
    m.rows.forEach(function (r) { if (!counts[r.tag] && r.rule !== 'closed') { r.rule = 'closed'; emptyToDicht.push(r.tag); } });
    // A bekend row that waited on such a topic now waits on the nearest topic above it that has cards (option A).
    var repointed = [];
    m.rows.forEach(function (r, i) {
      if (r.rule !== 'known') return;
      var from = r.from_tags.map(function (ft) {
        if (emptyToDicht.indexOf(ft) === -1) return ft;
        for (var k = i - 1; k >= 0; k--) {
          var up = m.rows[k];
          if (up.rule !== 'closed' && counts[up.tag]) { repointed.push(r.tag + ': ' + ft + ' → ' + up.tag); return up.tag; }
        }
        return ft;
      });
      r.from_tags = from.filter(function (t, j) { return from.indexOf(t) === j; });
    });
    var tagKeys = readTable_(ss.getSheetByName('Tags')).rows.map(function (r) { return String(r.tag).trim().toLowerCase(); });
    var checks = validateCurriculum_(m.rows, tagKeys);
    var prog = ss.getSheetByName('Progress');
    var fr = headersOf_(prog).indexOf('first_review') + 1;
    var setRows = readTable_(ss.getSheetByName('Settings')).rows;
    var report = {
      dryRun: dryRun,
      before: old.sort(function (a, b) { return a.order - b.order; }).map(function (r) {
        return [r.order, r.tag, r.unlock_threshold, r.max_wait_days === null ? '' : r.max_wait_days, r.active, r.open].join(' | ');
      }),
      after: m.rows.map(function (r, i) {
        return curriculumRowToSheet_(r).join(' | ') + (checks[i].errors.length ? '  ⚠ ' + checks[i].errors.join(' ') : '') +
          (checks[i].warnings.length ? '  (' + checks[i].warnings.join(' ') + ')' : '');
      }),
      seedChanged: seeded,
      emptyToDicht: emptyToDicht,
      repointed: repointed,
      reliedOnMaxWaitDays: m.reliedOnWait,
      oldDicht: m.closed,
      dependedOnDichtCascade: m.belowClosed,
      inactive: m.inactive,
      progressFirstReview: fr ? 'column ' + fr + ' removed' : 'not there',
      settings: setRows.filter(function (r) { return OBSOLETE_SETTINGS.indexOf(String(r.key).trim()) !== -1; }).map(function (r) { return 'remove ' + r.key + ' = ' + r.value; })
        .concat(SETTINGS_DEFAULTS.filter(function (d) { return !setRows.some(function (r) { return String(r.key).trim() === d[0]; }); })
          .map(function (d) { return 'add ' + d[0] + ' = ' + d[1]; }))
    };
    if (dryRun) return report;
    cur.clearContents();
    cur.getRange('A2:G').clearDataValidations();
    if (cur.getMaxColumns() > SCHEMA.Curriculum.length) cur.deleteColumns(SCHEMA.Curriculum.length + 1, cur.getMaxColumns() - SCHEMA.Curriculum.length);
    cur.getRange(1, 1, 1, SCHEMA.Curriculum.length).setValues([SCHEMA.Curriculum]).setFontWeight('bold').setBackground('#e8eaed');
    cur.getRange('F2:F').setNumberFormat('@');
    if (m.rows.length) cur.getRange(2, 1, m.rows.length, SCHEMA.Curriculum.length).setValues(m.rows.map(curriculumRowToSheet_));
    applyCurriculumValidation_(cur);
    if (fr) prog.deleteColumn(fr);
    seedSettings_(ss.getSheetByName('Settings'));
    applyLayout_(ss);
    updateCurriculumDashboard_(true);
    return report;
  });
}

/**
 * Replaces every Cards row tagged klok-1/2/3 with KLOK_SEED_CARDS and adds klok-3 to the app card
 * "minuut". dryRun (default) only reports what would change.
 */
function adminReplaceKlok_(dryRun) {
  return withLock_(function () {
    var sh = sheet_('Cards');
    var t = readTable_(sh);
    var newIds = {};
    KLOK_SEED_CARDS.forEach(function (l) { newIds[l.split('|')[0]] = true; });
    var isKlok = function (r) { return splitTags_(r.tags).some(function (x) { return /^klok-[123]$/.test(x); }); };
    var remove = t.rows.filter(function (r) { return isKlok(r) && !newIds[String(r.id)] && String(r.nl).trim().toLowerCase() !== 'minuut'; });
    var minuut = t.rows.filter(function (r) {
      return String(r.nl).trim().toLowerCase() === 'minuut' && splitTags_(r.tags).indexOf('app') !== -1;
    })[0];
    var existing = {};
    t.rows.forEach(function (r) { existing[String(r.id)] = true; });
    var add = klokRows_().filter(function (r) { return !existing[r[0]]; });
    // Existing K-cards whose prompt (nl) or answer differs from the seed get the seed's text.
    var seedAnswer = {}, seedNl = {};
    klokRows_().forEach(function (r) { seedAnswer[r[0]] = r[11]; seedNl[r[0]] = r[2]; });
    var differs = function (r) {
      var id = String(r.id);
      return seedAnswer.hasOwnProperty(id) && (text_(r.answer) !== seedAnswer[id] || text_(r.nl) !== seedNl[id]);
    };
    var update = t.rows.filter(differs);
    var report = {
      dryRun: dryRun,
      remove: remove.map(function (r) { return String(r.id) + ' | ' + text_(r.fr) + ' → ' + text_(r.nl); }),
      add: add.map(function (r) { return r[0] + ' | ' + r[1] + ' | ' + r[2] + (r[11] ? ' → ' + r[11] : ''); }),
      update: update.map(function (r) {
        var id = String(r.id);
        return id + ' | ' + text_(r.nl) + (text_(r.nl) !== seedNl[id] ? ' → ' + seedNl[id] : '') + ' | ' +
          text_(r.answer) + (text_(r.answer) !== seedAnswer[id] ? ' → ' + seedAnswer[id] : '');
      }),
      minuut: minuut ? String(minuut.id) + ': ' + minuut.tags + ' → ' + (splitTags_(minuut.tags).indexOf('klok-3') === -1 ? minuut.tags + ', klok-3' : '(already)') : 'not found'
    };
    if (dryRun) return report;
    remove.map(function (r) { return r._row; }).sort(function (a, b) { return b - a; })
      .forEach(function (n) { sh.deleteRow(n); });
    if (minuut && splitTags_(minuut.tags).indexOf('klok-3') === -1) {
      var fresh = readTable_(sh).rows.filter(function (r) { return String(r.id) === String(minuut.id); })[0];
      sh.getRange(fresh._row, CARD_COLS.indexOf('tags') + 1).setValue(splitTags_(minuut.tags).concat(['klok-3']).join(', '));
    }
    if (update.length) {
      var ansCol = CARD_COLS.indexOf('answer') + 1, nlCol = CARD_COLS.indexOf('nl') + 1;
      readTable_(sh).rows.forEach(function (r) {
        if (!differs(r)) return;
        sh.getRange(r._row, nlCol).setNumberFormat('@').setValue(seedNl[String(r.id)]);
        sh.getRange(r._row, ansCol).setNumberFormat('@').setValue(seedAnswer[String(r.id)]);
      });
    }
    if (add.length) writeCardRows_(sh, add);
    return report;
  });
}

/**
 * Emoji course: tag `emoji`, Curriculum row at order 3 (later rows shift down), and EMOJI_SEED_CARDS as
 * enkel cards. Refuses PROD unless allowProd. dryRun (default) only reports. Idempotent.
 */
function adminSeedEmoji_(dryRun, allowProd) {
  if (env_() === 'PROD' && !allowProd) throw apiError_('forbidden', 'seedEmoji is DEV only (pass allowProd to override)');
  return withLock_(function () {
    var ss = ss_();
    var tagsSh = ss.getSheetByName('Tags');
    var hasTag = readTable_(tagsSh).rows.some(function (r) { return String(r.tag).trim() === 'emoji'; });
    var cur = ss.getSheetByName('Curriculum');
    var curRows = readTable_(cur).rows;
    var hasRow = curRows.some(function (r) { return String(r.tag).trim() === 'emoji'; });
    var shift = hasRow ? [] : curRows.filter(function (r) { return Number(r.order) >= 3; });
    var cards = ss.getSheetByName('Cards');
    var have = {};
    readTable_(cards).rows.forEach(function (r) { have[String(r.id)] = true; });
    var parts = EMOJI_SEED_ADDED.split('-');
    var added = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var add = EMOJI_SEED_CARDS.map(function (l) { return l.split('|'); }).filter(function (f) { return !have[f[0]]; })
      .map(function (f) { return [f[0], typeNl_('oneway'), f[1], '', 'emoji', '', '', '', 'emoji', '', f[2], added, true]; });
    var report = {
      dryRun: dryRun,
      tag: hasTag ? 'exists' : 'add emoji',
      curriculum: hasRow ? 'exists' : 'insert order 3; shift ' + shift.map(function (r) { return r.tag + ' ' + r.order + '→' + (Number(r.order) + 1); }).join(', '),
      add: add.map(function (r) { return r[0] + ' | ' + r[2] + ' → ' + r[11]; })
    };
    if (dryRun) return report;
    if (!hasTag) {
      tagsSh.getRange(nextRow_(tagsSh, 1), 1, 1, SCHEMA.Tags.length)
        .setValues([rowFromObject_(SCHEMA.Tags, { tag: 'emoji', label_nl: 'emoji', label_fr: 'emoji', description: 'Emoji → Nederlands woord', subject_nl: '' })]);
    }
    if (!hasRow) {
      shift.forEach(function (r) { cur.getRange(r._row, 1).setValue(Number(r.order) + 1); });
      cur.getRange(nextRow_(cur, 2), 1, 1, SCHEMA.Curriculum.length).setValues([[3, 'emoji', RULE_NL.always, '', '', '']]);
      var data = cur.getRange(2, 1, Math.max(nextRow_(cur, 2) - 2, 1), SCHEMA.Curriculum.length); // filled rows only
      data.sort({ column: 1, ascending: true });
    }
    if (add.length) writeCardRows_(cards, add);
    updateCurriculumDashboard_(true);
    return report;
  });
}

/** Teacher review UI allowlist: emails (comma/space separated) and/or a Workspace domain. Returns the result. */
function adminSetTeachers_(emails, domain) {
  var p = props_();
  if (emails !== undefined) {
    var list = (Array.isArray(emails) ? emails : String(emails || '').split(/[\s,;]+/))
      .map(function (x) { return String(x).trim().toLowerCase(); }).filter(function (x) { return /@/.test(x); });
    p.setProperty('TEACHER_EMAILS', list.join(','));
  }
  if (domain !== undefined) p.setProperty('TEACHER_DOMAIN', String(domain || '').trim().toLowerCase().replace(/^@/, ''));
  return { teacher_emails: p.getProperty('TEACHER_EMAILS') || '', teacher_domain: p.getProperty('TEACHER_DOMAIN') || '' };
}

/**
 * Turns on Settings.require_approval (only goedgekeurd cards go to the app). With approveStudied (default),
 * every card that has a Progress row is first set to goedgekeurd, so the learner keeps the
 * cards she has studied. Dry run unless dryRun:false.
 */
function adminEnableApproval_(dryRun, approveStudied) {
  return withLock_(function () {
    var ss = ss_();
    var cards = ss.getSheetByName('Cards');
    var t = readTable_(cards);
    var cc = t.headers.indexOf('controle') + 1;
    if (!cc) throw apiError_('setup_needed', 'Cards.controle missing: run setup first');
    var studied = {};
    readTable_(ss.getSheetByName('Progress')).rows.forEach(function (r) { if (r.card_id) studied[String(r.card_id)] = true; });
    var toApprove = approveStudied ? t.rows.filter(function (r) { return studied[String(r.id)]; }) : [];
    var after = t.rows.filter(function (r) {
      return cardServed_(r, true) || toApprove.indexOf(r) !== -1 && cardServed_(r, false);
    });
    var report = {
      dryRun: dryRun,
      studiedCards: Object.keys(studied).length,
      approve: toApprove.map(function (r) { return r.id + ' | ' + r.nl + (checkCode_(r.controle) === 'approved' ? ' (al goedgekeurd)' : ''); }),
      servedBefore: t.rows.filter(function (r) { return cardServed_(r, false); }).length,
      servedAfter: after.length,
      studiedNotServed: Object.keys(studied).filter(function (id) { return !after.some(function (r) { return String(r.id) === id; }); })
    };
    if (dryRun) return report;
    toApprove.forEach(function (r) { cards.getRange(r._row, cc).setValue(CHECK_NL.approved); });
    var set = ss.getSheetByName('Settings');
    var row = readTable_(set).rows.filter(function (r) { return String(r.key).trim() === 'require_approval'; })[0];
    if (!row) throw apiError_('setup_needed', 'Settings.require_approval missing: run setup first');
    set.getRange(row._row, 2).setValue(true);
    return report;
  });
}

/**
 * Sets Cards.controle for many cards: {updates:[{id, controle:'goedgekeurd'|'afgekeurd'|''}]} (e.g. to copy
 * PROD approvals to DEV). Dry run unless dryRun:false.
 */
function adminSetCheck_(updates, dryRun) {
  return withLock_(function () {
    var sh = sheet_('Cards');
    var t = readTable_(sh);
    var cc = t.headers.indexOf('controle');
    if (cc < 0) throw apiError_('setup_needed', 'Cards.controle missing: run setup first');
    var byId = {};
    t.rows.forEach(function (r) { byId[String(r.id)] = r; });
    var n = Math.max(sh.getLastRow() - 1, 1); // whole columns, so blank rows keep their place
    var col = sh.getRange(2, cc + 1, n, 1).getValues();
    var changed = 0, unknown = [], bad = [];
    (updates || []).forEach(function (u) {
      var r = byId[String(u.id)];
      if (!r) { unknown.push(u.id); return; }
      var code = checkCode_(u.controle);
      if (u.controle && !code) { bad.push(u.id + ': ' + u.controle); return; }
      var v = code ? CHECK_NL[code] : '';
      var i = r._row - 2;
      if (String(col[i][0] || '') !== v) { col[i][0] = v; changed++; }
    });
    var report = { dryRun: dryRun, updates: (updates || []).length, changed: changed, unknown: unknown, bad: bad };
    if (dryRun) return report;
    sh.getRange(2, cc + 1, col.length, 1).setValues(col);
    return report;
  });
}

/**
 * Adds Curriculum rows: {rows:[{order, tag, regel, datum, percentage, van_tags}]} (regel default altijd). Skips tags that
 * already have a row; refuses tags missing from the Tags tab. Dry run unless dryRun:false.
 */
function adminAddCurriculum_(rows, dryRun) {
  if (!Array.isArray(rows) || !rows.length) throw apiError_('bad_request', 'rows[] required');
  return withLock_(function () {
    var sh = sheet_('Curriculum');
    var have = readTable_(sh).rows.map(function (r) { return String(r.tag).trim().toLowerCase(); });
    var known = readTable_(sheet_('Tags')).rows.map(function (r) { return String(r.tag).trim().toLowerCase(); });
    var add = [], skipped = [];
    rows.forEach(function (r) {
      var tag = String(r.tag || '').trim().toLowerCase();
      if (have.indexOf(tag) !== -1) { skipped.push(tag + ': already in Curriculum'); return; }
      if (known.indexOf(tag) === -1) { skipped.push(tag + ': not in Tags'); return; }
      add.push(curriculumRowToSheet_({ order: Number(r.order), tag: tag, rule: ruleCode_(r.regel || 'altijd'), date: String(r.datum || ''),
        percentage: r.percentage === undefined || r.percentage === '' ? null : Number(r.percentage),
        from_tags: Array.isArray(r.van_tags) ? r.van_tags : splitTags_(r.van_tags) }));
      have.push(tag);
    });
    var report = { dryRun: dryRun, add: add.map(function (r) { return r.join(' | '); }), skipped: skipped };
    if (dryRun || !add.length) return report;
    sh.getRange(nextRow_(sh, 2), 1, add.length, SCHEMA.Curriculum.length).setValues(add);
    updateCurriculumDashboard_(true);
    return report;
  });
}

/**
 * Removes tags everywhere: {tags:[...]} → out of Cards.tags and Inbox.tags, their Curriculum rows and Tags rows.
 * Dry run unless dryRun:false.
 */
function adminRemoveTags_(tags, dryRun) {
  var drop = (tags || []).map(function (t) { return String(t).trim().toLowerCase(); }).filter(function (t) { return t; });
  if (!drop.length) throw apiError_('bad_request', 'tags[] required');
  return withLock_(function () {
    var report = { dryRun: dryRun, tags: drop, Cards: 0, Inbox: 0, Curriculum: 0, Tags: 0 };
    ['Cards', 'Inbox'].forEach(function (tab) {
      var sh = sheet_(tab), t = readTable_(sh), col = t.headers.indexOf('tags') + 1;
      t.rows.forEach(function (r) {
        var cur = splitTags_(r.tags), keep = cur.filter(function (x) { return drop.indexOf(x) === -1; });
        if (keep.length === cur.length) return;
        report[tab]++;
        if (!dryRun) sh.getRange(r._row, col).setValue(keep.join(', '));
      });
    });
    ['Curriculum', 'Tags'].forEach(function (tab) {
      var sh = sheet_(tab);
      var rows = readTable_(sh).rows.filter(function (r) { return drop.indexOf(String(r.tag).trim().toLowerCase()) !== -1; });
      report[tab] = rows.length;
      if (!dryRun) rows.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { sh.deleteRow(r._row); });
    });
    if (!dryRun) updateCurriculumDashboard_(true);
    return report;
  });
}

/** Deletes every Cards row with controle = afgekeurd. DEV only (PROD progress is keyed by card id). Dry run unless dryRun:false. */
function adminDeleteRejected_(dryRun) {
  if (env_() === 'PROD') throw apiError_('forbidden', 'deleteRejected is DEV only');
  return withLock_(function () {
    var sh = sheet_('Cards');
    var gone = readTable_(sh).rows.filter(function (r) { return checkCode_(r.controle) === 'rejected'; });
    var report = { dryRun: dryRun, delete: gone.map(function (r) { return r.id + ' | ' + (r.article ? r.article + ' ' : '') + r.nl; }) };
    if (dryRun) return report;
    gone.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { sh.deleteRow(r._row); });
    return report;
  });
}

/**
 * Appends cards straight to Cards: {rows:[{id?, type, nl, article, pos, fr, example_nl, example_fr, tags,
 * flags, answer, added?, active?, controle}]} (e.g. DEV → PROD). Keeps the id when free; skips a row whose id or
 * (type, nl, article) is already in Cards. Dry run unless dryRun:false.
 */
function adminImportCards_(rows, dryRun) {
  if (!Array.isArray(rows) || !rows.length) throw apiError_('bad_request', 'rows[] required');
  return withLock_(function () {
    var sh = sheet_('Cards');
    var key = function (type, nl, article) {
      return (typeCode_(type) || 'word') + '|' + String(nl || '').trim().toLowerCase() + '|' + String(article || '').trim().toLowerCase();
    };
    var ids = {}, keys = {};
    readTable_(sh).rows.forEach(function (r) { ids[String(r.id)] = true; keys[key(r.type, r.nl, r.article)] = true; });
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var out = [], skipped = [];
    rows.forEach(function (r) {
      var k = key(r.type, r.nl, r.article);
      if (!String(r.nl || '').trim() || keys[k] || (r.id && ids[String(r.id)])) { skipped.push(r.nl); return; }
      var code = checkCode_(r.controle);
      var id = r.id && !ids[String(r.id)] ? String(r.id) : newId_('c_');
      var added = r.added ? new Date(String(r.added) + 'T00:00:00') : today;
      out.push(rowFromObject_(SCHEMA.Cards, {
        id: id, type: typeNl_(typeCode_(r.type) || 'word'), nl: String(r.nl), article: r.article === 'de' || r.article === 'het' ? r.article : '',
        pos: posNl_(r.pos), fr: String(r.fr || ''), example_nl: String(r.example_nl || ''), example_fr: String(r.example_fr || ''),
        tags: tagsNl_(Array.isArray(r.tags) ? r.tags.join(', ') : String(r.tags || '')),
        flags: Array.isArray(r.flags) ? r.flags.join(', ') : String(r.flags || ''), answer: String(r.answer || ''),
        added: isNaN(added) ? today : added, active: r.active === undefined ? true : bool_(r.active),
        controle: code ? CHECK_NL[code] : ''
      }));
      ids[id] = true; keys[k] = true;
    });
    var report = { dryRun: dryRun, add: out.length, skipped: skipped };
    if (dryRun || !out.length) return report;
    writeCardRows_(sh, out);
    return report;
  });
}

/** Moves cards back to the Inbox (status voorgesteld, same id): {ids:[...]}. Dry run unless dryRun:false. */
function adminCardsToInbox_(ids, dryRun) {
  if (!Array.isArray(ids) || !ids.length) throw apiError_('bad_request', 'ids[] required');
  return withLock_(function () {
    var cards = sheet_('Cards'), inbox = sheet_('Inbox');
    var rows = ids.map(function (id) { return findById_(cards, id); }).filter(function (r) { return r; });
    var report = { dryRun: dryRun, move: rows.map(function (r) { return r.id + ' | ' + r.nl; }), notFound: ids.length - rows.length };
    if (dryRun || !rows.length) return report;
    var out = rows.map(function (r) {
      var o = {}; CARD_COLS.forEach(function (h) { o[h] = r[h]; }); o.status = STATUS_NL.proposed;
      return rowFromObject_(SCHEMA.Inbox, o);
    });
    inbox.getRange(nextRow_(inbox, 3), 1, out.length, SCHEMA.Inbox.length).setValues(out);
    rows.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { cards.deleteRow(r._row); });
    return report;
  });
}

/**
 * Brings the Settings tab in line with SETTINGS_DEFAULTS: removes OBSOLETE_SETTINGS rows and adds missing keys
 * with their default (existing values are never changed). Dry run unless dryRun:false.
 */
function adminCleanSettings_(dryRun) {
  return withLock_(function () {
    var sh = sheet_('Settings');
    var rows = readTable_(sh).rows;
    var keys = rows.map(function (r) { return String(r.key).trim(); });
    var report = {
      dryRun: dryRun,
      remove: rows.filter(function (r) { return OBSOLETE_SETTINGS.indexOf(String(r.key).trim()) !== -1; })
        .map(function (r) { return r.key + ' = ' + r.value; }),
      add: SETTINGS_DEFAULTS.filter(function (d) { return keys.indexOf(d[0]) === -1; }).map(function (d) { return d[0] + ' = ' + d[1]; }),
      keep: rows.filter(function (r) { return r.key && OBSOLETE_SETTINGS.indexOf(String(r.key).trim()) === -1; })
        .map(function (r) { return r.key + ' = ' + r.value; })
    };
    if (!dryRun) seedSettings_(sh);
    return report;
  });
}

/** Deletes whole tabs of removed features: {tabs:['Breaks','Compliments']} only. Dry run unless dryRun:false. */
function adminDeleteTabs_(tabs, dryRun) {
  var allowed = ['Breaks', 'Compliments'];
  return withLock_(function () {
    var ss = ss_();
    var report = { dryRun: dryRun, tabs: [] };
    (tabs || []).forEach(function (name) {
      if (allowed.indexOf(name) === -1) throw apiError_('bad_request', 'only ' + allowed.join(', ') + ' may be deleted');
      var sh = ss.getSheetByName(name);
      if (!sh) { report.tabs.push(name + ': not there'); return; }
      report.tabs.push(name + ': ' + Math.max(0, sh.getLastRow() - 1) + ' rows');
      if (!dryRun) ss.deleteSheet(sh);
    });
    return report;
  });
}

/** Changes the value of one known Settings key: {key, value}; adds the row (with its description) when missing. Dry run unless dryRun:false. */
function adminSetSetting_(key, value, dryRun) {
  var def = SETTINGS_DEFAULTS.filter(function (d) { return d[0] === key; })[0];
  if (!def) throw apiError_('bad_request', 'unknown setting ' + key);
  var v = typeof def[1] === 'number' ? Number(value) : typeof def[1] === 'boolean' ? bool_(value) : String(value);
  if (typeof def[1] === 'number' && !isFinite(v)) throw apiError_('bad_request', key + ' must be a number');
  return withLock_(function () {
    var sh = sheet_('Settings');
    var row = readTable_(sh).rows.filter(function (r) { return String(r.key).trim() === key; })[0];
    var report = { dryRun: dryRun, key: key, from: row ? row.value : '(no row: added)', to: v };
    if (dryRun) return report;
    if (row) sh.getRange(row._row, 2).setValue(v);
    else sh.appendRow([key, v, def[2]]);
    return report;
  });
}


/** Splits a text into its parts: first at " — " (question — answer), else into sentences. */
function splitParts_(text) {
  var t = String(text || '').trim();
  if (t.indexOf(' — ') !== -1) return t.split(' — ').map(function (x) { return x.trim(); }).filter(String);
  return t.split(/(?<=[.?!])\s+(?=[A-ZÀ-ÝĲ¿¡«"'])/).map(function (x) { return x.trim(); }).filter(String);
}

/**
 * Inbox rows with two (or more) sentences become one card per sentence: nl and fr are split the same way
 * (" — " first, else at sentence ends). Rows whose nl and fr don't give the same number of parts are left alone
 * and listed. Dry run unless dryRun:false.
 */
function adminSplitInbox_(dryRun, given) {
  // given (optional): {id: [{nl, fr}, …]} — explicit parts for a row that is one sentence (e.g. "… aan en doe …").
  return withLock_(function () {
    var sh = sheet_('Inbox');
    var t = readTable_(sh);
    var split = [], skipped = [], add = [];
    t.rows.forEach(function (r) {
      var parts = given && given[String(r.id)];
      if (given && !parts) return; // explicit mode: only the given rows
      var nl = parts ? parts.map(function (p) { return String(p.nl || '').trim(); }) : splitParts_(r.nl);
      var fr = parts ? parts.map(function (p) { return String(p.fr || '').trim(); }) : splitParts_(r.fr);
      if (nl.length < 2) return;
      if (nl.length !== fr.length) { skipped.push(r.nl); return; }
      split.push(r);
      nl.forEach(function (part, i) {
        var o = {};
        SCHEMA.Inbox.forEach(function (h) { o[h] = r[h]; });
        o.id = newId_('c_'); o.nl = part; o.fr = fr[i];
        add.push(rowFromObject_(SCHEMA.Inbox, o));
      });
    });
    var report = { dryRun: dryRun, rows: split.length, cards: add.length, skipped: skipped,
      preview: add.map(function (row) { return row[SCHEMA.Inbox.indexOf('nl')] + ' | ' + row[SCHEMA.Inbox.indexOf('fr')]; }) };
    if (dryRun || !add.length) return report;
    sh.getRange(nextRow_(sh, 3), 1, add.length, SCHEMA.Inbox.length).setValues(add);
    split.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { sh.deleteRow(r._row); });
    return report;
  });
}

/**
 * Cards with two (or more) sentences become one card per sentence, split like splitInbox (nl and fr the same way).
 * The parts take the original's place in the sheet (same tags, added, controle) with new ids. Never touched:
 * klok cards, enkel cards, and cards she has studied (a Progress or Log row) — their progress is keyed by the id;
 * includeStudied (DEV only) splits those too. Dry run unless dryRun:false.
 */
function adminSplitCards_(dryRun, includeStudied) {
  if (includeStudied && env_() === 'PROD') throw apiError_('forbidden', 'includeStudied is DEV only');
  return withLock_(function () {
    var ss = ss_();
    var sh = ss.getSheetByName('Cards');
    var t = readTable_(sh);
    var studied = {};
    ['Progress', 'Log'].forEach(function (name) {
      var tab = ss.getSheetByName(name);
      if (tab) readTable_(tab).rows.forEach(function (r) { if (r.card_id) studied[String(r.card_id)] = true; });
    });
    var jobs = [], keptStudied = [], skipped = [];
    t.rows.forEach(function (r) {
      if (typeCode_(r.type) === 'oneway' || /(^|,\s*)klok/.test(String(r.tags))) return;
      var nl = splitParts_(r.nl), fr = splitParts_(r.fr);
      if (nl.length < 2) return;
      if (studied[String(r.id)] && !includeStudied) { keptStudied.push(r.id + ' | ' + r.nl); return; }
      if (nl.length !== fr.length) { skipped.push(r.id + ' | ' + r.nl); return; }
      jobs.push({ r: r, rows: nl.map(function (part, i) {
        var o = {};
        t.headers.forEach(function (h) { o[h] = r[h]; });
        o.id = newId_('c_'); o.nl = part; o.fr = fr[i];
        return rowFromObject_(t.headers, o);
      }) });
    });
    var nlCol = t.headers.indexOf('nl'), frCol = t.headers.indexOf('fr');
    var report = { dryRun: dryRun, split: jobs.length, cards: 0, keptStudied: keptStudied, skipped: skipped, preview: [] };
    jobs.forEach(function (j) {
      report.cards += j.rows.length;
      report.preview.push(j.r.id + ' | ' + j.r.nl + '  →  ' + j.rows.map(function (x) { return x[nlCol] + ' (' + x[frCol] + ')'; }).join('  +  '));
    });
    if (dryRun) return report;
    jobs.sort(function (a, b) { return b.r._row - a.r._row; }).forEach(function (j) {
      var at = j.r._row, n = j.rows.length;
      sh.insertRowsAfter(at, n); // the new rows take the formats and checkboxes of the original row
      sh.getRange(at + 1, 1, n, t.headers.length).setValues(j.rows);
      sh.deleteRow(at);
    });
    return report;
  });
}

/**
 * Deletes Cards rows by id: {ids:[...]} (the teacher's explicit choice, also on PROD). Reports which of them she
 * studied (their Progress/Log rows stay, unused). Dry run unless dryRun:false.
 */
function adminDeleteCards_(ids, dryRun) {
  if (!Array.isArray(ids) || !ids.length) throw apiError_('bad_request', 'ids[] required');
  return withLock_(function () {
    var ss = ss_(), sh = ss.getSheetByName('Cards');
    var studied = {};
    readTable_(ss.getSheetByName('Progress')).rows.forEach(function (r) { if (r.card_id) studied[String(r.card_id)] = true; });
    var rows = ids.map(function (id) { return findById_(sh, id); }).filter(function (r) { return r; });
    var report = { dryRun: dryRun, delete: rows.map(function (r) { return r.id + ' | ' + r.nl + (studied[String(r.id)] ? ' (studied)' : ''); }),
      notFound: ids.length - rows.length };
    if (dryRun) return report;
    rows.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { sh.deleteRow(r._row); });
    return report;
  });
}

/**
 * Changes card fields by id: {updates:[{id, fields:{answer, fr, nl, …}}], tab?: 'Cards'|'Inbox'} — only the fields the review page may edit
 * (REVIEW_EDITABLE), plus `added` (YYYY-MM-DD; changes where a new card comes in the queue). Other fields or bad
 * values are not written and listed in `ignored`. Same id, so her progress stays. Dry run unless dryRun:false.
 */
function adminUpdateCards_(updates, dryRun, tab) {
  if (!Array.isArray(updates) || !updates.length) throw apiError_('bad_request', 'updates[] required');
  if (tab && tab !== 'Cards' && tab !== 'Inbox') throw apiError_('bad_request', 'tab must be Cards or Inbox');
  return withLock_(function () {
    var sh = sheet_(tab || 'Cards'), headers = headersOf_(sh);
    var report = { dryRun: dryRun, change: [], notFound: [], ignored: [] };
    updates.forEach(function (u) {
      var row = findById_(sh, u.id);
      if (!row) { report.notFound.push(u.id); return; }
      var f = {}, extra = {};
      Object.keys(u.fields || {}).forEach(function (k) {
        var v = u.fields[k];
        if (REVIEW_EDITABLE.indexOf(k) !== -1) f[k] = v;
        else if (k === 'added' && /^\d{4}-\d\d-\d\d$/.test(String(v))) extra[k] = new Date(String(v) + 'T00:00:00');
        // Anything else (unknown field, date not YYYY-MM-DD) is NOT written.
        else report.ignored.push(u.id + ' ' + k + ': "' + v + '"');
      });
      Object.keys(f).concat(Object.keys(extra)).forEach(function (k) {
        report.change.push(u.id + ' ' + k + ': "' + row[k] + '" → "' + (k in f ? f[k] : u.fields[k]) + '"');
      });
      if (dryRun) return;
      if (Object.keys(f).length) writeFields_(sh, row, f);
      Object.keys(extra).forEach(function (k) { sh.getRange(row._row, headers.indexOf(k) + 1).setValue(extra[k]); });
    });
    return report;
  });
}

/**
 * Tags rows by key: {rows:[{tag, label_nl?, label_fr?, description?, subject_nl?}]} (e.g. DEV → PROD). Changes the
 * given fields of an existing row; a missing tag gets a new row. Never removes a row. Dry run unless dryRun:false.
 */
function adminUpdateTags_(rows, dryRun) {
  if (!Array.isArray(rows) || !rows.length) throw apiError_('bad_request', 'rows[] required');
  return withLock_(function () {
    var sh = sheet_('Tags'), t = readTable_(sh);
    var byTag = {};
    t.rows.forEach(function (r) { byTag[String(r.tag).trim().toLowerCase()] = r; });
    var report = { dryRun: dryRun, change: [], add: [] };
    rows.forEach(function (u) {
      var tag = String(u.tag || '').trim().toLowerCase();
      if (!/^[a-z0-9-]{2,30}$/.test(tag)) throw apiError_('bad_request', 'bad tag ' + tag);
      var row = byTag[tag];
      if (!row) {
        var o = { tag: tag };
        SCHEMA.Tags.slice(1).forEach(function (k) { o[k] = String(u[k] || ''); });
        report.add.push(SCHEMA.Tags.map(function (k) { return o[k]; }).join(' | '));
        if (!dryRun) sh.getRange(nextRow_(sh, 1), 1, 1, SCHEMA.Tags.length).setValues([rowFromObject_(SCHEMA.Tags, o)]);
        byTag[tag] = o;
        return;
      }
      SCHEMA.Tags.slice(1).forEach(function (k) {
        if (u[k] === undefined || String(u[k]) === String(row[k] || '')) return;
        report.change.push(tag + ' ' + k + ': "' + row[k] + '" → "' + u[k] + '"');
        if (!dryRun) sh.getRange(row._row, t.headers.indexOf(k) + 1).setValue(String(u[k]));
      });
    });
    return report;
  });
}

/**
 * Curriculum rows by tag: {rows:[{tag, order?, regel?, datum?, percentage?, van_tags?}]} (e.g. DEV → PROD). Changes the
 * given fields of existing rows only (new rows: addCurriculum). Dry run unless dryRun:false.
 */
function adminUpdateCurriculum_(rows, dryRun) {
  if (!Array.isArray(rows) || !rows.length) throw apiError_('bad_request', 'rows[] required');
  return withLock_(function () {
    var sh = sheet_('Curriculum'), t = readTable_(sh);
    var byTag = {};
    t.rows.forEach(function (r) { byTag[String(r.tag).trim().toLowerCase()] = r; });
    var report = { dryRun: dryRun, change: [], notFound: [] };
    rows.forEach(function (u) {
      var tag = String(u.tag || '').trim().toLowerCase(), row = byTag[tag];
      if (!row) { report.notFound.push(tag); return; }
      ['order', 'regel', 'datum', 'percentage', 'van_tags'].forEach(function (k) {
        if (u[k] === undefined) return;
        var v = k === 'regel' ? (RULE_NL[ruleCode_(u[k])] || String(u[k])) :
          k === 'van_tags' ? (Array.isArray(u[k]) ? u[k] : splitTags_(u[k])).join(', ') :
          k === 'datum' ? String(u[k] || '') : (u[k] === '' || u[k] === null ? '' : Number(u[k]));
        var cur = row[k] instanceof Date ? Utilities.formatDate(row[k], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(row[k]);
        if (String(v) === cur) return;
        report.change.push(tag + ' ' + k + ': "' + cur + '" → "' + v + '"');
        if (!dryRun) sh.getRange(row._row, t.headers.indexOf(k) + 1).setValue(v);
      });
    });
    if (!dryRun && report.change.length) updateCurriculumDashboard_(true);
    return report;
  });
}

/**
 * Replaces one subject by another in the tags of a tab: {from, to, tab:'Inbox'|'Cards'}. `to` must exist in Tags;
 * a row that already has `to` just loses `from`. Dry run unless dryRun:false.
 */
function adminReplaceTag_(from, to, tab, dryRun) {
  from = String(from || '').trim().toLowerCase(); to = String(to || '').trim().toLowerCase();
  if (!from || !to || (tab !== 'Inbox' && tab !== 'Cards')) throw apiError_('bad_request', 'from, to and tab (Inbox|Cards) required');
  return withLock_(function () {
    var known = readTable_(sheet_('Tags')).rows.map(function (r) { return String(r.tag).trim().toLowerCase(); });
    if (known.indexOf(to) === -1) throw apiError_('bad_request', to + ' is not in Tags');
    var sh = sheet_(tab), t = readTable_(sh), col = t.headers.indexOf('tags') + 1;
    var rows = t.rows.filter(function (r) { return splitTags_(r.tags).indexOf(from) !== -1; });
    var report = { dryRun: dryRun, tab: tab, rows: rows.length, examples: rows.slice(0, 5).map(function (r) { return r.nl + ' [' + r.tags + ']'; }) };
    if (!dryRun) rows.forEach(function (r) {
      var tags = splitTags_(r.tags).map(function (x) { return x === from ? to : x; });
      sh.getRange(r._row, col).setValue(tags.filter(function (x, i) { return tags.indexOf(x) === i; }).join(', '));
    });
    return report;
  });
}

/**
 * One-off (2026-10-05): removes the 🚩 Cards.nakijken column (refuses while a card still has it ticked) and turns
 * Inbox status nakijken into voorgesteld. Dry run unless dryRun:false.
 */
function adminDropNakijken_(dryRun) {
  return withLock_(function () {
    var cards = sheet_('Cards'), t = readTable_(cards), col = t.headers.indexOf('nakijken') + 1;
    var ticked = col ? t.rows.filter(function (r) { return bool_(r.nakijken); }).map(function (r) { return r.id + ' | ' + r.nl; }) : [];
    var inbox = sheet_('Inbox'), it = readTable_(inbox), sc = it.headers.indexOf('status') + 1;
    var flaggedInbox = it.rows.filter(function (r) { return String(r.status).trim().toLowerCase() === 'nakijken'; });
    var report = { dryRun: dryRun, column: col ? 'Cards column ' + col + ' removed' : 'not there', ticked: ticked,
      inboxNakijkenToVoorgesteld: flaggedInbox.length };
    if (ticked.length) { report.refused = 'cards still ticked: move them to the Inbox first'; return report; }
    if (dryRun) return report;
    flaggedInbox.forEach(function (r) { inbox.getRange(r._row, sc).setValue(STATUS_NL.proposed); });
    if (col) { cards.getRange(2, col, Math.max(cards.getMaxRows() - 1, 1), 1).clearDataValidations(); cards.deleteColumn(col); }
    return report;
  });
}

/**
 * One-off (2026-10-05): removes the tags_source column from Cards and Inbox (the code no longer has it; run right
 * after deploying, since rows are written in schema order). Dry run unless dryRun:false.
 */
function adminDropTagsSource_(dryRun) {
  return withLock_(function () {
    var report = { dryRun: dryRun };
    ['Cards', 'Inbox'].forEach(function (name) {
      var sh = sheet_(name), col = headersOf_(sh).indexOf('tags_source') + 1;
      report[name] = col ? 'column ' + col + ' removed' : 'not there';
      if (!dryRun && col) { sh.getRange(1, col, sh.getMaxRows(), 1).clearDataValidations(); sh.deleteColumn(col); }
    });
    if (!dryRun) applyCardValidation_(sheet_('Cards'), false), applyCardValidation_(sheet_('Inbox'), true);
    return report;
  });
}
