// Web app entry points. Every response is JSON with HTTP 200:
//   { ok: true, ... }  or  { ok: false, error: '<code>', message: '...' }
// Students never call this: the app reads content.json from its own site. Callers: teachers (their invite key,
// from /docent/ — TeacherApi.gs), the owner (admin key: scripts/admin.mjs, the Admin / Publish content workflows —
// AdminApi.gs and the actions below) and the owner-only HtmlService pages (Google login). Keys: Auth.gs.

function doGet(e) {
  var p = (e && e.parameter) || {};
  // Owner pages: only served by the login-required page deployment, to an allowed Google account.
  if (p.page) {
    var page = serveTeacher_(p.page);
    return page || json_({ ok: false, error: 'forbidden', message: 'Alleen voor de eigenaar.' });
  }
  if (!p.action && teacherAllowed_(teacherEmail_())) return serveTeacher_('start');
  return handle_(function () {
    var action = p.action || '';
    // A POST whose body was lost to a redirect arrives here as a bare GET: tell the client to retry.
    if (!action) throw apiError_('no_action', 'Missing action (retry the POST).');
    if (action === 'ping') return { env: env_() };
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
    var action = String(body.action || '');
    var who = authenticate_(body.key !== undefined ? body.key : body.token);
    if (who.role === 'teacher') return teacherAction_(who.teacher, action, body);
    if (who.role === 'export') {
      if (action !== 'export') throw apiError_('forbidden', 'The export key can only export.');
      return exportGroups_();
    }
    if (action.indexOf('admin.') === 0) return runAdmin_(action, body);
    var dryRun = body.dryRun !== false;
    switch (action) {
      case 'export': return exportGroups_(); // the owner may run it too (scripts/build-content.mjs locally)
      case 'migrateV2': return adminMigrateV2_(dryRun);
      case 'listCards': return adminListCards_();
      case 'tags': return adminTags_(body.add);
      case 'readTab': return adminReadTab_(body.tab, body.rows);
      case 'deleteTabs': return adminDeleteTabs_(body.tabs, dryRun);
      case 'setSetting': return adminSetSetting_(body.key, body.value, dryRun);
      case 'groups': return { groups: readGroups_() };
    }
    throw apiError_('unknown_action', 'Unknown POST action: ' + action);
  });
}

/** The teacher actions (spec › API actions); `group` in the body is checked by each action (requireGroup_). */
function teacherAction_(t, action, body) {
  switch (action) {
    case 'me': return teacherMe_(t);
    case 'inbox': return teacherInbox_(t, body.group);
    case 'reviewCards': return teacherReviewCards_(t, body.group, body.decisions);
    case 'getCurriculum': return teacherGetCurriculum_(t, body.group);
    case 'saveCurriculum': return teacherSaveCurriculum_(t, body.group, body.rows, body.version);
    case 'propose': return teacherPropose_(t, body.group, body.proposal);
    case 'joinInfo': return teacherJoinInfo_(t, body.group);
    case 'publish': return teacherPublish_(t, body.group);
  }
  throw apiError_('forbidden', 'Not allowed: ' + action);
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

/**
 * A Cards row → the card JSON. `tr` (optional) = that card's translations by lang. For the current app the French
 * translation is also given as fr / example_fr (until the app reads `translations`, Phase 4).
 */
function cardToJson_(r, tr) {
  tr = tr || {};
  var translations = {};
  Object.keys(tr).forEach(function (lang) { translations[lang] = { text: tr[lang].text, example: tr[lang].example, status: tr[lang].status }; });
  return {
    id: String(r.id), type: typeCode_(r.type) || 'word', nl: text_(r.nl), article: String(r.article || ''),
    pos: String(r.pos || ''), example_nl: text_(r.example_nl), answer: text_(r.answer), tags: splitTags_(r.tags),
    flags: splitTags_(r.flags), added: isoDate_(r.added), active: bool_(r.active), status: cardStatus_(r.status),
    fr: tr.fr ? tr.fr.text : '', example_fr: tr.fr ? tr.fr.example : '', translations: translations
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
