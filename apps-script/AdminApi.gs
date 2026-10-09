// Owner actions admin.* (admin key). Institutions, teachers and their keys, groups and who manages them, and
// translations in bulk. Keys are returned ONCE (in the invite link) and only their hash is stored.

var DOCENT_PATH = 'docent/';

/** The teacher's invite link for this environment (the key after #: never sent to a server or logged). */
function inviteLink_(key) {
  return appUrl_() + DOCENT_PATH + '#key=' + key;
}

function appendRow_(name, obj) {
  var sh = sheet_(name);
  sh.getRange(nextRow_(sh, 1), 1, 1, SCHEMA[name].length).setValues([rowFromObject_(SCHEMA[name], obj)]);
}

function setCells_(name, row, fields) {
  var sh = sheet_(name), h = headersOf_(sh);
  Object.keys(fields).forEach(function (k) {
    var c = h.indexOf(k);
    if (c === -1) throw apiError_('bad_request', 'no column ' + k + ' in ' + name);
    sh.getRange(row, c + 1).setValue(fields[k]);
  });
}

function needInstitution_(id) {
  var i = readInstitutions_().filter(function (x) { return x.inst_id === id; })[0];
  if (!i) throw apiError_('bad_request', 'unknown institution ' + id);
  return i;
}

function needTeacher_(id) {
  var t = readTeachers_().filter(function (x) { return x.teacher_id === id; })[0];
  if (!t) throw apiError_('bad_request', 'unknown teacher ' + id);
  return t;
}

function needGroup_(code) {
  var g = readGroups_().filter(function (x) { return x.group_code === code; })[0];
  if (!g) throw apiError_('bad_request', 'unknown group ' + code);
  return g;
}

function languages_(v) {
  var list = (Array.isArray(v) ? v : splitTags_(v)).map(function (l) { return String(l).trim().toLowerCase(); })
    .filter(function (l, i, a) { return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(l) && a.indexOf(l) === i; });
  return list.join(',');
}

/** All admin.* actions: name → function(body). Writes hold the lock and go to AuditLog as teacher "owner". */
var ADMIN_ACTIONS = {
  /** Everything except key hashes. */
  'admin.overview': function () {
    return {
      institutions: readInstitutions_().map(function (i) { return { inst_id: i.inst_id, label: i.label, active: i.active }; }),
      teachers: readTeachers_().map(function (t) { return { teacher_id: t.teacher_id, inst_id: t.inst_id, label: t.label, active: t.active, created: t.created }; }),
      groups: readGroups_(),
      groupTeachers: readGroupTeachers_().map(function (x) { return { group_code: x.group_code, teacher_id: x.teacher_id }; })
    };
  },
  'admin.createInstitution': function (b) {
    var label = String(b.label || '').trim();
    if (!label) throw apiError_('bad_request', 'label required');
    var id = newId_('i_');
    appendRow_('Institutions', { inst_id: id, label: label, active: true });
    audit_('owner', 'createInstitution', '');
    return { inst_id: id };
  },
  /** A teacher (label only, e.g. "Docent A") with a fresh key; returns the invite link ONCE. */
  'admin.createTeacher': function (b) {
    needInstitution_(String(b.inst_id || ''));
    var label = String(b.label || '').trim() || 'Docent';
    var id = newId_('t_'), key = newKey_();
    appendRow_('Teachers', { teacher_id: id, inst_id: String(b.inst_id), label: label, key_hash: sha256Hex_(key), active: true, created: new Date() });
    audit_('owner', 'createTeacher ' + id, '');
    return { teacher_id: id, invite: inviteLink_(key) };
  },
  /** New key for a teacher (lost key, new device…): the old key stops working at once. */
  'admin.reissueKey': function (b) {
    var t = needTeacher_(String(b.teacher_id || ''));
    var key = newKey_();
    setCells_('Teachers', t._row, { key_hash: sha256Hex_(key), active: true });
    audit_('owner', 'reissueKey ' + t.teacher_id, '');
    return { teacher_id: t.teacher_id, invite: inviteLink_(key) };
  },
  'admin.setTeacherActive': function (b) {
    var t = needTeacher_(String(b.teacher_id || ''));
    setCells_('Teachers', t._row, { active: b.active === true });
    audit_('owner', (b.active === true ? 'activate ' : 'revoke ') + t.teacher_id, '');
    return { teacher_id: t.teacher_id, active: b.active === true };
  },
  /** A group with a random code; optionally a copy of another group's curriculum. */
  'admin.createGroup': function (b) {
    needInstitution_(String(b.inst_id || ''));
    var name = String(b.display_name || '').trim();
    if (!name) throw apiError_('bad_request', 'display_name required (neutral: it becomes public)');
    var code;
    var taken = readGroups_().map(function (g) { return g.group_code; });
    do { code = newGroupCode_(); } while (taken.indexOf(code) !== -1);
    appendRow_('Groups', { group_code: code, inst_id: String(b.inst_id), display_name: name,
      languages: languages_(b.languages || HELP_LANGS), active: true, content_version: '' });
    var copied = 0;
    if (b.copyCurriculumFrom) {
      var from = needGroup_(String(b.copyCurriculumFrom));
      var sh = sheet_('Curriculum');
      var rows = readCurriculum_(from.group_code);
      writeCurriculumTab_(sh, rows.map(function (r) { return curriculumSheetValues_(r, code, 1); }), code);
      copied = rows.length;
      // The same cards as that group (accepted there → accepted here; the teacher can hide them).
      var gcSh = sheet_('GroupCards'), src = readGroupCards_()[from.group_code] || {};
      var add = Object.keys(src).filter(function (id) { return src[id] === 'accepted'; })
        .map(function (id) { return rowFromObject_(SCHEMA.GroupCards, { group_code: code, card_id: id, status: 'accepted', updated: new Date() }); });
      if (add.length) gcSh.getRange(nextRow_(gcSh, 1), 1, add.length, SCHEMA.GroupCards.length).setValues(add);
    }
    audit_('owner', 'createGroup', code);
    return { group_code: code, curriculum_rows: copied };
  },
  'admin.updateGroup': function (b) {
    var g = needGroup_(String(b.group_code || ''));
    var sh = sheet_('Groups');
    var row = readTable_(sh).rows.filter(function (r) { return String(r.group_code).trim() === g.group_code; })[0];
    var f = {};
    if (b.display_name !== undefined) f.display_name = String(b.display_name).trim();
    if (b.languages !== undefined) f.languages = languages_(b.languages);
    if (b.active !== undefined) f.active = b.active === true;
    setCells_('Groups', row._row, f);
    audit_('owner', 'updateGroup', g.group_code);
    return { group: needGroup_(g.group_code) };
  },
  /** Lets a teacher manage a group — only a group of the teacher's own institution. */
  'admin.assignTeacher': function (b) {
    var t = needTeacher_(String(b.teacher_id || '')), g = needGroup_(String(b.group_code || ''));
    if (t.inst_id !== g.inst_id) throw apiError_('bad_request', 'teacher and group belong to different institutions');
    var have = readGroupTeachers_().some(function (x) { return x.teacher_id === t.teacher_id && x.group_code === g.group_code; });
    if (!have) appendRow_('GroupTeachers', { group_code: g.group_code, teacher_id: t.teacher_id });
    audit_('owner', 'assignTeacher ' + t.teacher_id, g.group_code);
    return { ok: true, added: !have };
  },
  'admin.unassignTeacher': function (b) {
    var sh = sheet_('GroupTeachers');
    var rows = readGroupTeachers_().filter(function (x) { return x.teacher_id === String(b.teacher_id) && x.group_code === String(b.group_code); })
      .sort(function (a, c) { return c._row - a._row; });
    rows.forEach(function (r) { sh.deleteRow(r._row); });
    audit_('owner', 'unassignTeacher ' + b.teacher_id, String(b.group_code || ''));
    return { removed: rows.length };
  },
  /**
   * Bulk upsert of translations: rows = [{card_id, lang, text, example?, status?}] (status default machine). Unknown
   * card ids are skipped; a machine row never replaces a reviewed one (kept). Dry run unless dryRun:false.
   */
  'admin.setTranslations': function (b) {
    var rows = Array.isArray(b.rows) ? b.rows : [];
    var ids = {};
    readTable_(sheet_('Cards')).rows.forEach(function (r) { ids[String(r.id)] = true; });
    var existing = readTranslations_(), plan = { add: 0, update: 0, kept_reviewed: [], unknown: [], bad: [] };
    var ok = rows.filter(function (r) {
      var lang = String(r && r.lang || '').toLowerCase();
      if (!r || !ids[String(r.card_id)]) { plan.unknown.push(r && r.card_id); return false; }
      if (!languages_([lang]) || !String(r.text || '').trim() || (r.status && TRANSLATION_STATUS.indexOf(r.status) === -1)) { plan.bad.push(r.card_id); return false; }
      var cur = (existing[String(r.card_id)] || {})[lang];
      if (cur && cur.status === 'reviewed' && (r.status || 'machine') === 'machine') { plan.kept_reviewed.push(r.card_id); return false; }
      if (cur) plan.update++; else plan.add++;
      return true;
    });
    if (b.dryRun !== false) { plan.dryRun = true; return plan; }
    // One write for the new rows; updates row by row.
    var sh = sheet_('Translations'), now = new Date(), fresh = [];
    ok.forEach(function (r) {
      var lang = String(r.lang).toLowerCase(), cur = (existing[String(r.card_id)] || {})[lang];
      var o = { card_id: String(r.card_id), lang: lang, text: String(r.text).trim(), example: String(r.example || '').trim(),
        status: r.status || 'machine', updated: now };
      if (cur) sh.getRange(cur._row, 1, 1, SCHEMA.Translations.length).setValues([rowFromObject_(SCHEMA.Translations, o)]);
      else fresh.push(rowFromObject_(SCHEMA.Translations, o));
    });
    if (fresh.length) sh.getRange(nextRow_(sh, 1), 1, fresh.length, SCHEMA.Translations.length).setValues(fresh);
    audit_('owner', 'setTranslations ' + ok.length, '');
    plan.dryRun = false;
    return plan;
  },
  /** Sets the deploy's read-only export key (only its SHA-256 is stored). */
  'admin.setExportKeyHash': function (b) {
    var h = String(b.hash || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(h)) throw apiError_('bad_request', 'hash must be 64 hex characters (SHA-256)');
    props_().setProperty('EXPORT_KEY_HASH', h);
    audit_('owner', 'setExportKeyHash', '');
    return { ok: true };
  },
  /** Sets the owner's key: stores only its SHA-256 and deletes the plain ADMIN_TOKEN of the first setup. */
  'admin.setAdminKeyHash': function (b) {
    var h = String(b.hash || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(h)) throw apiError_('bad_request', 'hash must be 64 hex characters (SHA-256)');
    var p = props_();
    p.setProperty('ADMIN_KEY_HASH', h);
    p.deleteProperty('ADMIN_TOKEN');
    audit_('owner', 'setAdminKeyHash', '');
    return { ok: true };
  }
};

/** Runs an admin.* action; writes hold the lock (overview is read-only). */
function runAdmin_(action, body) {
  var fn = ADMIN_ACTIONS[action];
  if (!fn) throw apiError_('unknown_action', 'Unknown admin action: ' + action);
  return action === 'admin.overview' ? fn(body) : withLock_(function () { return fn(body); });
}
