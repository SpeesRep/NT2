// Teacher actions (spec › API actions). Each takes the authenticated teacher (authenticate_) and checks the group
// on the server (requireGroup_). Writes run under the lock and are written to AuditLog.

var APP_URL_BY_ENV = { DEV: 'https://speesrep.github.io/NT2/dev/', PROD: 'https://speesrep.github.io/NT2/' };

function appUrl_() { return APP_URL_BY_ENV[env_()] || ''; }

function groupJson_(g) {
  return { code: g.group_code, display_name: g.display_name, languages: g.languages };
}

/** me: the teacher's label and groups. */
function teacherMe_(t) {
  return { label: t.label, groups: groupsForTeacher_(t, readGroupTeachers_(), readGroups_()).map(groupJson_) };
}

/** A card for the teacher page: the card fields + translations in the group's languages only. */
function teacherCard_(r, tr, group) {
  var mine = {};
  group.languages.forEach(function (l) { if (tr && tr[l]) mine[l] = tr[l]; });
  var c = cardToJson_(r, mine);
  delete c.fr; delete c.example_fr; delete c.status; delete c.active;
  return c;
}

/** inbox: approved cards waiting for this group's decision (GroupCards status inbox), oldest first. */
function teacherInbox_(t, code) {
  var g = requireGroup_(t, code);
  var gc = readGroupCards_()[g.group_code] || {}, tr = readTranslations_();
  var cards = readTable_(sheet_('Cards')).rows
    .filter(function (r) { return cardServed_(r) && gc[String(r.id)] === 'inbox'; })
    .map(function (r) { return teacherCard_(r, tr[String(r.id)], g); })
    .sort(function (a, b) { return a.added.localeCompare(b.added); });
  return { group: groupJson_(g), cards: cards };
}

/** groupCards: the group's accepted and hidden cards (to look back, or to un-hide one). */
function teacherGroupCards_(t, code) {
  var g = requireGroup_(t, code);
  var gc = readGroupCards_()[g.group_code] || {}, tr = readTranslations_();
  var cards = readTable_(sheet_('Cards')).rows
    .filter(function (r) { var st = gc[String(r.id)]; return cardServed_(r) && (st === 'accepted' || st === 'hidden'); })
    .map(function (r) { var c = teacherCard_(r, tr[String(r.id)], g); c.group_status = gc[String(r.id)]; return c; });
  return { group: groupJson_(g), cards: cards };
}

/**
 * reviewCards: decisions = [{card_id, status: 'accepted' | 'hidden'}] for cards that are in this group's GroupCards
 * (inbox, accepted or hidden) and approved in the bank. Other ids are reported, never added.
 */
function teacherReviewCards_(t, code, decisions) {
  var g = requireGroup_(t, code);
  if (!Array.isArray(decisions) || !decisions.length) throw apiError_('bad_request', 'decisions[] required');
  return withLock_(function () {
    var sh = sheet_('GroupCards'), rows = readTable_(sh).rows.filter(function (r) { return String(r.group_code).trim() === g.group_code; });
    var byId = {};
    rows.forEach(function (r) { byId[String(r.card_id)] = r; });
    var approved = {};
    readTable_(sheet_('Cards')).rows.forEach(function (r) { if (cardServed_(r)) approved[String(r.id)] = true; });
    var done = [], refused = [], col = SCHEMA.GroupCards.indexOf('status') + 1;
    decisions.forEach(function (d) {
      var id = String(d && d.card_id || ''), status = String(d && d.status || '');
      if (GROUP_CARD_STATUS.indexOf(status) === -1 || status === 'inbox' || !byId[id] || !approved[id]) { refused.push(id); return; }
      sh.getRange(byId[id]._row, col, 1, 2).setValues([[status, new Date()]]);
      done.push(id);
    });
    if (done.length) audit_(t.teacher_id, 'reviewCards ' + done.length, g.group_code);
    return { done: done, refused: refused };
  });
}

/**
 * getCurriculum: the group's rows, its version number, and the topics it can choose from (every tag, with the
 * cards this group gets and the approved cards in the bank).
 */
function teacherGetCurriculum_(t, code) {
  var g = requireGroup_(t, code);
  var ss = ss_(), sh = ss.getSheetByName('Curriculum');
  var info = editorTagInfo_(ss, g.group_code), bank = {};
  readTable_(sheet_('Cards')).rows.filter(cardServed_).forEach(function (r) { splitTags_(r.tags).forEach(function (x) { bank[x] = (bank[x] || 0) + 1; }); });
  var settings = readSettings_();
  return {
    group: groupJson_(g),
    rows: readCurriculum_(g.group_code).slice().sort(function (a, b) { return a.order - b.order; }),
    version: curriculumVersionNumber_(sh, g.group_code),
    topics: info.tags.map(function (x) { return { tag: x.tag, label: x.label, cards: x.cards, bank: bank[x.tag] || 0 }; }),
    known: { known_stability_days: Number(settings.known_stability_days), known_min_reviews: Number(settings.known_min_reviews) }
  };
}

/**
 * saveCurriculum: saves the rows only when `version` is still the group's version (else conflict: a colleague
 * saved first) and the shared validation passes. Returns {ok, version, checks} | {ok:false, conflict} | {ok:false, checks}.
 */
function teacherSaveCurriculum_(t, code, rows, version) {
  var g = requireGroup_(t, code);
  return withLock_(function () {
    var ss = ss_(), sh = ss.getSheetByName('Curriculum');
    var current = curriculumVersionNumber_(sh, g.group_code);
    if (Number(version) !== current) return { ok: false, conflict: true, version: current };
    var info = editorTagInfo_(ss, g.group_code);
    var plan = curriculumSavePlan_(rows, info.keys, info.counts);
    if (!plan.ok) return { ok: false, checks: plan.checks };
    writeCurriculumTab_(sh, plan.rows.map(function (r) { return curriculumSheetValues_(r, g.group_code, current + 1); }), g.group_code);
    audit_(t.teacher_id, 'saveCurriculum', g.group_code);
    return { ok: true, version: current + 1, checks: plan.checks };
  });
}

/** propose: a new word ({type:'new', nl, example_nl?, note?}) or a correction ({type:'correction', card_id, note}). */
function teacherPropose_(t, code, p) {
  var g = requireGroup_(t, code);
  p = p || {};
  var type = p.type === 'correction' ? 'correction' : p.type === 'new' ? 'new' : '';
  var clip = function (v, n) { return String(v == null ? '' : v).trim().slice(0, n); };
  var nl = clip(p.nl, 200), note = clip(p.note, 1000), example = clip(p.example_nl, 300), cardId = clip(p.card_id, 40);
  if (!type) throw apiError_('bad_request', 'type must be new or correction');
  if (type === 'new' && !nl) throw apiError_('bad_request', 'nl required');
  if (type === 'correction' && (!cardId || !note)) throw apiError_('bad_request', 'card_id and note required');
  return withLock_(function () {
    if (type === 'correction' && !findById_(sheet_('Cards'), cardId)) throw apiError_('bad_request', 'unknown card ' + cardId);
    var sh = sheet_('Proposals'), id = newId_('p_');
    sh.getRange(nextRow_(sh, 1), 1, 1, SCHEMA.Proposals.length).setValues([rowFromObject_(SCHEMA.Proposals, {
      proposal_id: id, group_code: g.group_code, teacher_id: t.teacher_id, type: type, card_id: cardId, nl: nl,
      example_nl: example, note: note, status: 'open', created: new Date() })]);
    audit_(t.teacher_id, 'propose ' + type, g.group_code);
    return { proposal_id: id };
  });
}

/** joinInfo: the join link, the group's own install page (iPhone) and the code. The QR code is drawn by the page. */
function teacherJoinInfo_(t, code) {
  var g = requireGroup_(t, code), base = appUrl_();
  return { group: groupJson_(g), code: g.group_code, link: base + '?groep=' + g.group_code, page: base + 'g/' + g.group_code + '/' };
}

/** publish: asks GitHub to rebuild the site (all groups); at most PUBLISH_LIMIT times per hour per group. */
function teacherPublish_(t, code) {
  var g = requireGroup_(t, code);
  rateLimit_('publish', g.group_code, PUBLISH_LIMIT);
  var res = dispatchPublish_();
  audit_(t.teacher_id, 'publish', g.group_code);
  return res;
}
