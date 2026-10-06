// Web app entry points. Every response is JSON with HTTP 200:
//   { ok: true, ... }  or  { ok: false, error: '<code>', message: '...' }

var MAX_EVENTS_PER_POST = 500;

function doGet(e) {
  var p = (e && e.parameter) || {};
  // Teacher review page: only served by the login-required teacher deployment, to an allowed teacher.
  if (p.page) {
    var page = serveTeacher_(p.page);
    return page || json_({ ok: false, error: 'forbidden', message: 'Open de leraren-link en log in met een toegestaan Google-account.' });
  }
  // The bare teacher link (no action, no page) opens Start for an allowed teacher; the anonymous API never does.
  if (!p.action && teacherAllowed_(teacherEmail_())) return serveTeacher_('start');
  return handle_(function () {
    var q = (e && e.parameter) || {};
    var action = q.action || '';
    // A POST whose body was lost to a redirect arrives here as a bare GET: tell the client to retry.
    if (!action) throw apiError_('no_action', 'Missing action (retry the POST).');
    if (action === 'ping') return { env: env_() };
    var role = roleFor_(q.token);
    if (!role) throw apiError_('unauthorized', 'Bad or missing token.');
    if (action === 'cards') return getCards_();
    if (action === 'state') return getState_();
    throw apiError_('unknown_action', 'Unknown GET action: ' + action);
  });
}

function doPost(e) {
  return handle_(function () {
    var body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
      throw apiError_('bad_json', 'Body must be JSON (sent as text/plain).');
    }
    var role = roleFor_(body.token);
    if (!role) throw apiError_('unauthorized', 'Bad or missing token.');
    var action = body.action || '';

    if (action === 'reviews') return postReviews_(body.events);

    if (role !== 'admin') throw apiError_('forbidden', 'Admin token required for ' + action);
    switch (action) {
      case 'listCards': return adminListCards_();
      case 'listUntagged': return adminListUntagged_();
      case 'tags': return adminTags_(body.add);
      case 'setTags': return adminSetTags_(body.updates);
      case 'appendInbox': return adminAppendInbox_(body.rows);
      case 'listInbox': return adminListInbox_();
      case 'seedEmoji': return adminSeedEmoji_(body.dryRun !== false, body.allowProd === true);
      case 'replaceKlok': return adminReplaceKlok_(body.dryRun !== false);
      case 'setCheck': return adminSetCheck_(body.updates, body.dryRun !== false);
      case 'enableApproval': return adminEnableApproval_(body.dryRun !== false, body.approveStudied !== false);
      case 'setTeachers': return adminSetTeachers_(body.emails, body.domain);
      case 'userInfo': return { rows: writeUserInfo_(ss_(), env_()) };
      case 'addCurriculum': return adminAddCurriculum_(body.rows, body.dryRun !== false);
      case 'removeTags': return adminRemoveTags_(body.tags, body.dryRun !== false);
      case 'deleteRejected': return adminDeleteRejected_(body.dryRun !== false);
      case 'importCards': return adminImportCards_(body.rows, body.dryRun !== false);
      case 'cardsToInbox': return adminCardsToInbox_(body.ids, body.dryRun !== false);
      case 'cleanSettings': return adminCleanSettings_(body.dryRun !== false);
      case 'deleteTabs': return adminDeleteTabs_(body.tabs, body.dryRun !== false);
      case 'setSetting': return adminSetSetting_(body.key, body.value, body.dryRun !== false);
      case 'dropTagsSource': return adminDropTagsSource_(body.dryRun !== false);
      case 'dropNakijken': return adminDropNakijken_(body.dryRun !== false);
      case 'splitInbox': return adminSplitInbox_(body.dryRun !== false, body.parts || null);
      case 'replaceTag': return adminReplaceTag_(body.from, body.to, body.tab, body.dryRun !== false);
      case 'updateTags': return adminUpdateTags_(body.rows, body.dryRun !== false);
      case 'updateCurriculum': return adminUpdateCurriculum_(body.rows, body.dryRun !== false);
      case 'updateCards': return adminUpdateCards_(body.updates, body.dryRun !== false, body.tab);
      case 'deleteCards': return adminDeleteCards_(body.ids, body.dryRun !== false);
      case 'migrateCurriculum': return adminMigrateCurriculum_(body.dryRun !== false);
      case 'splitCards': return adminSplitCards_(body.dryRun !== false, body.includeStudied === true);
      case 'setCurriculum': return adminSetCurriculum_(body.tag, body.field, body.value);
      case 'promoteInbox': return adminPromoteInbox_();
      case 'rebuildProgress': return adminRebuildProgress_();
      case 'setup': return { sheetUrl: setup() };
      case 'curriculumStatus': return { status: updateCurriculumDashboard_(true) };
      case 'readTab': return adminReadTab_(body.tab, body.rows);
      case 'reseedDev': return adminReseedDev_();
      case 'purgeSmoke': return adminPurgeSmoke_();
      case 'migrateToDutch': return { changed: migrateToDutch_(ss_()) };
      case 'state': return getState_();
      case 'cards': return getCards_();
    }
    throw apiError_('unknown_action', 'Unknown POST action: ' + action);
  });
}

function handle_(fn) {
  try {
    var result = fn() || {};
    result.ok = true;
    return json_(result);
  } catch (err) {
    return json_({ ok: false, error: err.apiCode || 'server_error', message: String(err.message || err) });
  }
}

// ---------- learner reads ----------

/** Cell → text. A time Sheets auto-converted (e.g. "7:15") comes back as "7:15", not a date. */
function text_(v) {
  if (v instanceof Date) {
    return v.getFullYear() < 1901 ? Utilities.formatDate(v, tz_(), 'H:mm') : Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  }
  return v == null ? '' : String(v);
}

function cardToJson_(r) {
  return {
    id: String(r.id), type: typeCode_(r.type) || 'word', nl: text_(r.nl), article: String(r.article || ''),
    pos: String(r.pos || ''), fr: text_(r.fr), example_nl: text_(r.example_nl),
    example_fr: text_(r.example_fr), answer: text_(r.answer), tags: splitTags_(r.tags),
    flags: splitTags_(r.flags), added: isoDate_(r.added), active: bool_(r.active)
  };
}

function getCards_() {
  var t0 = Date.now(), timing = {};
  var cardsSh = sheet_('Cards');
  timing.open = Date.now() - t0;
  var t = readTable_(cardsSh);
  timing.cards = Date.now() - t0;
  if (t.rows.some(function (r) { return String(r.id).trim() === ''; })) {
    withLock_(function () { fillIds_(cardsSh); });
    t = readTable_(cardsSh);
  }
  var settings = readSettings_();
  var cards = t.rows.filter(function (r) { return cardServed_(r, bool_(settings.require_approval)); })
    .map(cardToJson_);
  timing.settings = Date.now() - t0;
  var tags = readTable_(sheet_('Tags')).rows.map(function (r) {
    return { tag: String(r.tag).trim().toLowerCase(), label_nl: String(r.label_nl || r.tag || ''), label_fr: String(r.label_fr || ''),
      subject_nl: String(r.subject_nl || '').trim() };
  }).filter(function (x) { return x.tag; });
  var curriculum = curriculumForApi_({ settings: settings, tagKeys: tags.map(function (x) { return x.tag; }),
    cards: cards.map(function (c) { return { id: c.id, type: c.type, tags: c.tags }; }) });
  timing.curriculum = Date.now() - t0;
  return {
    env: env_(),
    serverTime: new Date().toISOString(),
    timing: timing,
    cards: cards,
    settings: settings,
    tags: tags,
    curriculum: curriculum
  };
}

function readSettings_() {
  var out = {};
  SETTINGS_DEFAULTS.forEach(function (d) { out[d[0]] = d[1]; });
  readTable_(sheet_('Settings')).rows.forEach(function (r) {
    var k = String(r.key).trim();
    if (!k) return;
    var v = r.value;
    if (typeof out[k] === 'number') v = Number(v);
    else if (typeof out[k] === 'boolean') v = bool_(v);
    out[k] = v;
  });
  return out;
}

function progressToJson_(r) {
  return {
    card_id: String(r.card_id), track: String(r.track), state: String(r.state),
    due: isoDateTime_(r.due), stability: Number(r.stability) || 0, difficulty: Number(r.difficulty) || 0,
    reps: Number(r.reps) || 0, lapses: Number(r.lapses) || 0, last_review: isoDateTime_(r.last_review)
  };
}

function getState_() {
  return {
    serverTime: new Date().toISOString(),
    progress: readTable_(sheet_('Progress')).rows.filter(function (r) { return r.card_id; }).map(progressToJson_)
  };
}

// ---------- reviews (idempotent) ----------

function validateEvent_(ev) {
  if (!ev || typeof ev !== 'object') return 'not_object';
  if (!ev.event_id || String(ev.event_id).length > 64) return 'event_id';
  if (!ev.card_id) return 'card_id';
  if (TRACKS.indexOf(ev.track) === -1) return 'track';
  if (!toDate_(ev.ts)) return 'ts';
  var r = Number(ev.rating);
  if (!(r >= 1 && r <= 4)) return 'rating';
  var s = ev.snapshot;
  if (!s || typeof s !== 'object' || !toDate_(s.due)) return 'snapshot';
  return '';
}

function postReviews_(events) {
  if (!Array.isArray(events)) throw apiError_('bad_request', 'events[] required');
  if (events.length > MAX_EVENTS_PER_POST) throw apiError_('too_many', 'Max ' + MAX_EVENTS_PER_POST + ' events per request');

  var result = withLock_(function () {
    var logSh = sheet_('Log');
    var last = logSh.getLastRow();
    var seen = {};
    if (last > 1) {
      logSh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { if (r[0] !== '') seen[String(r[0])] = true; });
    }

    var accepted = [], duplicate = [], rejected = [], rows = [], fresh = [];
    events.forEach(function (ev) {
      var problem = validateEvent_(ev);
      if (problem) { rejected.push({ event_id: ev && ev.event_id, reason: problem }); return; }
      var id = String(ev.event_id);
      if (seen[id]) { duplicate.push(id); return; }
      seen[id] = true;
      var s = ev.snapshot;
      var snapshot = {
        state: String(s.state), due: toDate_(s.due).toISOString(), stability: Number(s.stability) || 0,
        difficulty: Number(s.difficulty) || 0, reps: Number(s.reps) || 0, lapses: Number(s.lapses) || 0,
        learning_steps: Number(s.learning_steps) || 0, scheduled_days: Number(s.scheduled_days) || 0
      };
      rows.push([id, String(ev.card_id), ev.track, toDate_(ev.ts), Number(ev.rating),
        String(ev.mode || ''), Number(ev.duration_ms) || 0, JSON.stringify(snapshot)]);
      fresh.push({ card_id: String(ev.card_id), track: ev.track, ts: toDate_(ev.ts), snapshot: snapshot });
      accepted.push(id);
    });

    if (rows.length) {
      logSh.getRange(logSh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      applyToProgress_(fresh);
    }
    return { accepted: accepted, duplicate: duplicate, rejected: rejected };
  });
  if (result.accepted.length) {
    try { updateCurriculumDashboard_(false); } catch (e) { /* the dashboard must never break a sync */ }
  }
  return result;
}

/** Upserts Progress with each event's snapshot when it is at least as new as last_review. */
function applyToProgress_(items) {
  var sh = sheet_('Progress');
  var t = readTable_(sh);
  var byKey = {};
  t.rows.forEach(function (r) { byKey[r.card_id + '|' + r.track] = r; });
  items.sort(function (a, b) { return a.ts - b.ts; });

  var dirty = {}, appended = [];
  items.forEach(function (it) {
    var key = it.card_id + '|' + it.track;
    var row = byKey[key];
    if (row && row.last_review instanceof Date && row.last_review > it.ts) return;
    if (!row) { row = { card_id: it.card_id, track: it.track }; byKey[key] = row; appended.push(row); }
    var s = it.snapshot;
    row.state = s.state; row.due = new Date(s.due); row.stability = s.stability; row.difficulty = s.difficulty;
    row.reps = s.reps; row.lapses = s.lapses; row.last_review = it.ts;
    if (row._row) dirty[row._row] = row;
  });

  var headers = SCHEMA.Progress;
  Object.keys(dirty).forEach(function (rowNum) {
    sh.getRange(Number(rowNum), 1, 1, headers.length).setValues([rowFromObject_(headers, dirty[rowNum])]);
  });
  if (appended.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appended.length, headers.length)
      .setValues(appended.map(function (r) { return rowFromObject_(headers, r); }));
  }
}
