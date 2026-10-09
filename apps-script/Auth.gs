// Keys and permissions (spec › Teacher access). Teachers have no account: each gets a personal invite key
// (…/docent/#key=…, 32 random characters). The server stores only SHA-256 hashes: Teachers.key_hash, and Script
// Property ADMIN_KEY_HASH for the owner. Every request is checked here; a group code from the browser is never
// trusted on its own (teacherGroup_).
// The pure parts (hashing aside) are unit-tested in src/auth.test.ts.

var KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // 56 characters, no look-alikes
var KEY_LENGTH = 32; // 32 × log2(56) ≈ 186 bits
var FAIL_WINDOW_S = 600; // failed keys are counted per 10 minutes …
var FAIL_LIMIT = 20; // … and after this many, every key check is refused for FAIL_WINDOW_S (no IPs in Apps Script)
var PUBLISH_LIMIT = 4; // Publiceren per group per hour

/** Lower-case hex SHA-256 of a UTF-8 string. */
function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

/** A new random key (KEY_LENGTH characters of KEY_ALPHABET, unbiased). */
function newKey_() {
  var a = KEY_ALPHABET, out = '';
  while (out.length < KEY_LENGTH) {
    var hex = Utilities.getUuid().replace(/-/g, '');
    for (var i = 0; i + 1 < hex.length && out.length < KEY_LENGTH; i += 2) {
      var byte = parseInt(hex.substr(i, 2), 16);
      if (byte < 224) out += a.charAt(byte % a.length); // 224 = 4 × 56: no bias
    }
  }
  return out;
}

function looksLikeKey_(k) {
  return typeof k === 'string' && k.length === KEY_LENGTH && /^[A-Za-z0-9]+$/.test(k);
}

/**
 * The teacher for a key hash, from plain rows (pure): active teacher of an active institution, else null.
 * teachers = [{teacher_id, inst_id, label, key_hash, active}], institutions = [{inst_id, active}].
 */
function teacherForHash_(hash, teachers, institutions) {
  var t = teachers.filter(function (x) { return x.key_hash && x.key_hash === hash; })[0];
  if (!t || !t.active) return null;
  var inst = institutions.filter(function (i) { return i.inst_id === t.inst_id; })[0];
  return inst && inst.active ? t : null;
}

/**
 * The groups a teacher may manage (pure): assigned in GroupTeachers, active, AND of the teacher's own institution
 * (so a wrong GroupTeachers row can never open another school's group).
 */
function groupsForTeacher_(teacher, groupTeachers, groups) {
  var mine = groupTeachers.filter(function (gt) { return gt.teacher_id === teacher.teacher_id; })
    .map(function (gt) { return gt.group_code; });
  return groups.filter(function (g) { return g.active && g.inst_id === teacher.inst_id && mine.indexOf(g.group_code) !== -1; });
}

/** The requested group if this teacher may manage it (pure), else null. */
function teacherGroup_(teacher, code, groupTeachers, groups) {
  return groupsForTeacher_(teacher, groupTeachers, groups).filter(function (g) { return g.group_code === code; })[0] || null;
}

// ---------- reading the tabs ----------

function readTeachers_() {
  var sh = tabOrNull_('Teachers');
  if (!sh) return [];
  return readTable_(sh).rows.filter(function (r) { return String(r.teacher_id).trim(); }).map(function (r) {
    return { teacher_id: String(r.teacher_id).trim(), inst_id: String(r.inst_id).trim(), label: String(r.label || ''),
      key_hash: String(r.key_hash || '').trim(), active: bool_(r.active), created: isoDate_(r.created), _row: r._row };
  });
}

function readInstitutions_() {
  var sh = tabOrNull_('Institutions');
  if (!sh) return [];
  return readTable_(sh).rows.filter(function (r) { return String(r.inst_id).trim(); }).map(function (r) {
    return { inst_id: String(r.inst_id).trim(), label: String(r.label || ''), active: bool_(r.active), _row: r._row };
  });
}

function readGroupTeachers_() {
  var sh = tabOrNull_('GroupTeachers');
  if (!sh) return [];
  return readTable_(sh).rows.filter(function (r) { return String(r.group_code).trim() && String(r.teacher_id).trim(); })
    .map(function (r) { return { group_code: String(r.group_code).trim(), teacher_id: String(r.teacher_id).trim(), _row: r._row }; });
}

// ---------- the check for every request ----------

/**
 * {role:'admin'} | {role:'teacher', teacher} for a key; throws unauthorized / rate_limited. Failed keys are
 * counted in CacheService; past FAIL_LIMIT every check is refused for a while, and each failure is slowed down.
 */
function authenticate_(key) {
  var cache = CacheService.getScriptCache();
  if (Number(cache.get('auth_fail') || 0) >= FAIL_LIMIT) throw apiError_('rate_limited', 'Te veel foute sleutels. Probeer het later opnieuw.');
  if (typeof key === 'string' && key.length >= KEY_LENGTH && key.length <= 128) {
    var hash = sha256Hex_(key);
    var p = props_(), adminHash = p.getProperty('ADMIN_KEY_HASH');
    if (adminHash && safeEquals_(hash, adminHash)) return { role: 'admin' };
    // Until the first admin.setAdminKeyHash, the plain ADMIN_TOKEN of the first setup still works (then it is deleted).
    if (!adminHash && safeEquals_(key, p.getProperty('ADMIN_TOKEN'))) return { role: 'admin' };
    var t = teacherForHash_(hash, readTeachers_(), readInstitutions_());
    if (t) return { role: 'teacher', teacher: t };
  }
  cache.put('auth_fail', String(Number(cache.get('auth_fail') || 0) + 1), FAIL_WINDOW_S);
  Utilities.sleep(800);
  throw apiError_('unauthorized', 'Onbekende of ingetrokken sleutel.');
}

/** The group from the request, only when this teacher may manage it; throws forbidden otherwise. */
function requireGroup_(teacher, code) {
  var g = teacherGroup_(teacher, String(code || ''), readGroupTeachers_(), readGroups_());
  if (!g) throw apiError_('forbidden', 'Geen toegang tot deze groep.');
  return g;
}

/** Appends to AuditLog (who did what to which group). Never contains student data. */
function audit_(teacherId, action, groupCode) {
  var sh = tabOrNull_('AuditLog');
  if (!sh) return;
  sh.getRange(nextRow_(sh, 1), 1, 1, SCHEMA.AuditLog.length).setValues([[new Date(), teacherId || '', action, groupCode || '']]);
}

/** Limits a per-group action (e.g. publish) to `limit` per hour; throws rate_limited. */
function rateLimit_(name, groupCode, limit) {
  var cache = CacheService.getScriptCache(), k = 'rl_' + name + '_' + groupCode;
  var n = Number(cache.get(k) || 0);
  if (n >= limit) throw apiError_('rate_limited', 'Even wachten: dit kan maar ' + limit + ' keer per uur.');
  cache.put(k, String(n + 1), 3600);
}
