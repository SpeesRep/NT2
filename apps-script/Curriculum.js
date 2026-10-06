// Curriculum: reading the tab, the shared validation, the status (Dashboard) and the migration from the old chain.
// The phone decides what to introduce (src/curriculum.ts). This file mirrors validation + status for the Dashboard
// (and the teacher editor) — keep the two in sync (src/curriculumParity.test.ts, docs/SHEET.md › Curriculum).

var RULE_NL = { always: 'altijd', date: 'datum', known: 'bekend', closed: 'dicht' };
var RULES = ['always', 'date', 'known', 'closed'];

/** Sheet value of Curriculum.regel → 'always' | 'date' | 'known' | 'closed'; any other text is kept (and fails validation). */
function ruleCode_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  for (var code in RULE_NL) if (s === RULE_NL[code] || s === code) return code;
  return String(v === null || v === undefined ? '' : v).trim();
}

/** The Curriculum tab as rows {order, tag, rule, date, percentage, from_tags} (sheet order). */
function readCurriculum_() {
  var sh = ss_().getSheetByName('Curriculum');
  if (!sh) return [];
  return readTable_(sh).rows.filter(function (r) { return String(r.tag).trim() || String(r.regel).trim(); }).map(curriculumRowFromSheet_);
}

function curriculumRowFromSheet_(r) {
  var d = r.datum;
  var pct = r.percentage === '' || r.percentage === null || r.percentage === undefined ? null : Number(r.percentage);
  return {
    order: r.order === '' || isNaN(Number(r.order)) ? 0 : Number(r.order),
    tag: String(r.tag || '').trim().toLowerCase(),
    rule: ruleCode_(r.regel),
    date: d instanceof Date ? isoDate_(d) : String(d || '').trim(),
    percentage: pct === null || isNaN(pct) ? null : pct,
    from_tags: splitTags_(r.van_tags)
  };
}

function validDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-').map(Number);
  var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return dt.getUTCFullYear() === p[0] && dt.getUTCMonth() === p[1] - 1 && dt.getUTCDate() === p[2];
}

function isInt_(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

/**
 * THE shared validation (setup, Dashboard, teacher editor; the phone has the same rules in src/curriculum.ts).
 * rows in sheet order; tagKeys = keys of the Tags tab; cardCounts (optional) = active cards per tag → warning.
 * Returns one {errors:[], warnings:[]} per row, in plain Dutch. A dicht row skips the rule checks.
 */
function validateCurriculum_(rows, tagKeys, cardCounts) {
  var known = {};
  tagKeys.forEach(function (t) { known[t] = true; });
  var firstRow = {}, orderCount = {};
  rows.forEach(function (r) {
    if (r.tag && !firstRow[r.tag]) firstRow[r.tag] = r;
    orderCount[String(r.order)] = (orderCount[String(r.order)] || 0) + 1;
  });
  return rows.map(function (r) {
    var errors = [], warnings = [];
    if (!r.tag) errors.push('Vul een tag in.');
    else if (!known[r.tag]) errors.push('Tag "' + r.tag + '" staat niet in het tabblad Tags.');
    else if (firstRow[r.tag] !== r) errors.push('Tag "' + r.tag + '" staat al hoger in het curriculum.');
    if (!(isInt_(r.order) && r.order >= 1)) errors.push('Vul bij order een heel getal in (1, 2, 3 …).');
    else if (orderCount[String(r.order)] > 1) errors.push('Order ' + r.order + ' komt meer dan één keer voor.');
    if (r.rule === 'closed') return { errors: errors, warnings: warnings };
    if (RULES.indexOf(r.rule) === -1) {
      errors.push(r.rule ? 'Onbekende regel "' + r.rule + '": kies altijd, datum, bekend of dicht.' : 'Kies een regel: altijd, datum, bekend of dicht.');
    } else if (r.rule === 'date') {
      if (!validDate_(r.date)) errors.push('Regel datum: vul een geldige datum in.');
    } else if (r.rule === 'known') {
      if (r.percentage === null || !isInt_(r.percentage) || r.percentage < 1 || r.percentage > 100) {
        errors.push('Regel bekend: vul een percentage in van 1 tot 100.');
      }
      if (!r.from_tags.length) errors.push('Regel bekend: vul bij van_tags minstens één onderwerp in.');
      r.from_tags.forEach(function (ft) {
        var src = firstRow[ft];
        if (!known[ft]) errors.push('van_tags: "' + ft + '" staat niet in het tabblad Tags.');
        else if (!src) errors.push('van_tags: "' + ft + '" staat niet in het curriculum.');
        else if (!(src.order < r.order)) errors.push('van_tags: "' + ft + '" moet hoger in de lijst staan dan "' + r.tag + '".');
        else if (src.rule === 'closed') warnings.push(r.tag + ' wacht op ' + ft + ', dat nu dicht is.');
      });
    }
    if (cardCounts && r.tag && !cardCounts[r.tag]) warnings.push('Dit onderwerp heeft geen actieve kaarten.');
    return { errors: errors, warnings: warnings };
  });
}

/**
 * Same as curriculumStatus() in src/curriculum.ts. cards = [{id, type, tags}] (served cards), progressByKey =
 * 'id|track' → {stability, reps}; known = {known_stability_days, known_min_reviews}; today = 'YYYY-MM-DD';
 * opened = the phone's latch (the server has none: {}).
 */
function curriculumStatus_(rows, cards, progressByKey, known, today, opened, tagKeys) {
  var checks = validateCurriculum_(rows, tagKeys);
  var scores = {};
  function scoreOf(tag) {
    if (!scores[tag]) {
      var tagged = cards.filter(function (c) { return c.tags.indexOf(tag) !== -1; });
      var k = tagged.filter(function (c) {
        var p = progressByKey[c.id + '|' + (c.type === 'word' ? 'recog' : 'prod')];
        return p && Number(p.stability) >= known.known_stability_days && Number(p.reps) >= known.known_min_reviews;
      }).length;
      scores[tag] = { cards: tagged.length, known: k };
    }
    return scores[tag];
  }
  function pct(s) { return s.cards ? s.known / s.cards : 1; }
  var latch = {};
  Object.keys(opened).forEach(function (k) { latch[k] = opened[k]; });
  var sorted = rows.map(function (r, i) { return { r: r, v: checks[i], i: i }; })
    .sort(function (a, b) { return a.r.order - b.r.order || a.i - b.i; });
  var out = sorted.map(function (x) {
    var r = x.r, v = x.v, own = scoreOf(r.tag);
    var fromScores = r.rule === 'known' ? r.from_tags.map(function (t) { return { tag: t, score: pct(scoreOf(t)) }; }) : [];
    var open = false, latched = false, state;
    if (r.rule === 'closed') {
      state = 'closed';
      if (!v.errors.length) delete latch[r.tag];
    } else if (opened[r.tag]) {
      open = latched = true; state = 'open';
    } else if (v.errors.length) {
      state = 'error';
    } else if (r.rule === 'always') {
      open = true; state = 'open';
    } else if (r.rule === 'date') {
      open = today >= r.date; state = open ? 'open' : 'date';
    } else {
      open = r.from_tags.every(function (t) { var s = scoreOf(t); return s.known * 100 >= (r.percentage === null ? 101 : r.percentage) * s.cards; });
      state = open ? 'open' : 'waiting';
    }
    if (open && !latched && !latch[r.tag]) latch[r.tag] = today;
    return { order: r.order, tag: r.tag, rule: r.rule, date: r.date, percentage: r.percentage, from_tags: r.from_tags,
      errors: v.errors, warnings: v.warnings, cards: own.cards, known: own.known, score: pct(own), open: open, latched: latched,
      state: state, fromScores: fromScores };
  });
  var withRow = {};
  rows.forEach(function (r) { withRow[r.tag] = true; });
  var openList = [];
  out.forEach(function (s) { if (s.open && openList.indexOf(s.tag) === -1) openList.push(s.tag); });
  Object.keys(latch).forEach(function (t) { if (!withRow[t] && openList.indexOf(t) === -1) openList.push(t); });
  return { rows: out, open: openList, opened: latch };
}

/**
 * Served cards, Progress and settings → the status as the server sees it (no latch). `pre` (optional, from
 * getCards_) = {cards:[{id, type, tags}], settings, tagKeys, rows} so nothing is read twice.
 */
function curriculumNow_(pre) {
  pre = pre || {};
  var ss = ss_();
  var settings = pre.settings || readSettings_();
  var gate = bool_(settings.require_approval);
  var cards = pre.cards || readTable_(ss.getSheetByName('Cards')).rows
    .filter(function (r) { return cardServed_(r, gate); })
    .map(function (r) { return { id: String(r.id), type: typeCode_(r.type), tags: splitTags_(r.tags) }; });
  var byKey = {};
  var prog = ss.getSheetByName('Progress');
  var pv = prog.getLastRow() > 1 ? prog.getRange(2, 1, prog.getLastRow() - 1, 7).getValues() : []; // card_id … reps
  pv.forEach(function (r) { if (r[0]) byKey[r[0] + '|' + r[1]] = { stability: r[4], reps: r[6] }; });
  var tagKeys = pre.tagKeys || readTable_(ss.getSheetByName('Tags')).rows.map(function (r) { return String(r.tag).trim().toLowerCase(); })
    .filter(String);
  var counts = {};
  cards.forEach(function (c) { c.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
  var rows = pre.rows || readCurriculum_();
  var known = { known_stability_days: Number(settings.known_stability_days), known_min_reviews: Number(settings.known_min_reviews) };
  var status = curriculumStatus_(rows, cards, byKey, known, isoDate_(new Date()), {}, tagKeys);
  var checks = validateCurriculum_(rows, tagKeys, counts); // with the "no active cards" warning
  var warnByTag = {};
  rows.forEach(function (r, i) { warnByTag[r.tag] = checks[i].warnings; });
  status.rows.forEach(function (s) { s.warnings = warnByTag[s.tag] || s.warnings; });
  return status;
}

/** The rule as a short Dutch sentence. */
function ruleText_(s) {
  if (s.rule === 'always') return 'altijd';
  if (s.rule === 'closed') return 'dicht';
  if (s.rule === 'date') return 'datum: ' + s.date;
  if (s.rule === 'known') return 'bekend: ' + s.percentage + ' % van ' + s.from_tags.join(', ');
  return s.rule || '(leeg)';
}

function statusText_(s) {
  if (s.state === 'open') return 'open';
  if (s.state === 'closed') return 'dicht';
  if (s.state === 'date') return 'opent op ' + s.date;
  if (s.state === 'waiting') return 'wacht op ' + s.fromScores.filter(function (f) { return f.score * 100 < s.percentage; })
    .map(function (f) { return f.tag; }).join(', ');
  return 'fout';
}

/** Writes the Curriculum block on the Dashboard (columns D:I). Throttled to every 10 min unless forced. */
function updateCurriculumDashboard_(force) {
  var cache = CacheService.getScriptCache();
  if (!force && cache.get('curriculum_dash')) return null;
  cache.put('curriculum_dash', '1', 600);

  var status = curriculumNow_();
  var dash = ss_().getSheetByName('Dashboard');
  dash.getRange('D1:I60').clearContent();
  var rows = [['Curriculum (tag)', 'regel', 'status', 'bekend', 'score van_tags', 'fout / let op']];
  status.rows.forEach(function (s) {
    var from = s.fromScores.map(function (f) { return f.tag + ': ' + Math.round(f.score * 100) + ' % van ' + s.percentage + ' %'; }).join('; ');
    rows.push([s.tag, ruleText_(s), statusText_(s), s.known + ' / ' + s.cards, s.rule === 'closed' ? '' : from,
      s.errors.concat(s.warnings).join(' ')]);
  });
  dash.getRange(1, 4, rows.length, rows[0].length).setValues(rows);
  dash.getRange(1, 4, 1, rows[0].length).setFontWeight('bold').setBackground('#e8eaed');
  dash.getRange(rows.length + 2, 4).setValue('Bijgewerkt: ' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm') +
    ' (na herhalingen, max. elke 10 min). Een onderwerp dat op de telefoon al open was, blijft daar open (dat ziet het Dashboard niet).');
  return status.rows;
}

/**
 * Rows for the app. The legacy fields (open/active/unlock_threshold/min_reviews/max_wait_days) let an app version
 * from before 2026-10-05 follow the server's status until it updates; the current app ignores them.
 */
function curriculumForApi_(pre) {
  pre = pre || {};
  pre.rows = pre.rows || readCurriculum_();
  var status = curriculumNow_(pre);
  var openByTag = {};
  status.rows.forEach(function (s) { openByTag[s.tag] = s.open; });
  return pre.rows.map(function (r) {
    return { order: r.order, tag: r.tag, rule: r.rule, date: r.date, percentage: r.percentage, from_tags: r.from_tags,
      open: openByTag[r.tag] ? 'always' : 'closed', active: true, unlock_threshold: 0, min_reviews: 0, max_wait_days: null };
  });
}

/**
 * Old chain rows {order, tag, unlock_threshold, max_wait_days, active, open:'auto'|'always'|'closed'} → new rows.
 * Row N+1 = bekend round(100 × row N's threshold) of row N (the previous ACTIVE row); threshold 0 or 'always' →
 * altijd; the first row → altijd; 'closed' → dicht. Returns {rows, reliedOnWait, closed, inactive, belowClosed}.
 */
function migrateCurriculumRows_(old) {
  var sorted = old.slice().sort(function (a, b) { return a.order - b.order; });
  var prev = null, closedSeen = null;
  var out = [], reliedOnWait = [], closed = [], inactive = [], belowClosed = [];
  sorted.forEach(function (r, i) {
    var row = { order: r.order, tag: r.tag, rule: 'always', date: '', percentage: null, from_tags: [] };
    if (r.open === 'closed') {
      row.rule = 'closed';
      closed.push(r.tag);
      closedSeen = closedSeen || r.tag;
    } else if (i === 0 || !prev || r.open === 'always' || !(prev.unlock_threshold > 0)) {
      row.rule = 'always';
    } else {
      row.rule = 'known';
      row.percentage = Math.round(100 * prev.unlock_threshold);
      row.from_tags = [prev.tag];
      if (prev.max_wait_days !== null && prev.max_wait_days !== '' && prev.max_wait_days !== undefined) reliedOnWait.push(r.tag);
    }
    if (closedSeen && r.open === 'auto' && r.tag !== closedSeen) belowClosed.push(r.tag);
    if (r.active === false) inactive.push(r.tag);
    out.push(row);
    if (r.active !== false) prev = r;
  });
  return { rows: out, reliedOnWait: reliedOnWait, closed: closed, inactive: inactive, belowClosed: belowClosed };
}

/** The fixed seed applied after the migration (2026-10-05). Only for rows that exist. */
var CURRICULUM_MIGRATION_SEED = {
  'app': { rule: 'always' },
  'klok-1': { rule: 'always' },
  'klok-2': { rule: 'known', percentage: 80, from_tags: ['klok-1'] },
  'klok-3': { rule: 'known', percentage: 80, from_tags: ['klok-2'] }
};

function curriculumRowToSheet_(r) {
  return [r.order, r.tag, RULE_NL[r.rule] || r.rule, r.date || '', r.percentage === null ? '' : r.percentage, (r.from_tags || []).join(', ')];
}
