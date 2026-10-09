// v2 data layer: Translations, Groups, GroupCards (Schema.gs › SCHEMA). Small helpers that read a tab once and
// write single rows; callers that write hold the lock (withLock_). Relations go by id, never by name.

var GROUP_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes: no 0/o, 1/l/i
var GROUP_CODE_LENGTH = 8;

/** A random group code (8 characters of GROUP_CODE_ALPHABET; never derived from a name). */
function newGroupCode_() {
  var a = GROUP_CODE_ALPHABET, out = '';
  while (out.length < GROUP_CODE_LENGTH) {
    var hex = Utilities.getUuid().replace(/-/g, '');
    for (var i = 0; i + 1 < hex.length && out.length < GROUP_CODE_LENGTH; i += 2) {
      var byte = parseInt(hex.substr(i, 2), 16);
      if (byte < 248) out += a.charAt(byte % a.length); // 248 = 8 × 31: no bias
    }
  }
  return out;
}

function isGroupCode_(s) {
  return new RegExp('^[' + GROUP_CODE_ALPHABET + ']{' + GROUP_CODE_LENGTH + '}$').test(String(s || ''));
}

/** The tab, or null when it does not exist yet (before the v2 migration). */
function tabOrNull_(name) {
  return ss_().getSheetByName(name);
}

// ---------- Translations ----------

/** card_id → lang → {text, example, status, updated, _row}. */
function readTranslations_() {
  var sh = tabOrNull_('Translations'), out = {};
  if (!sh) return out;
  readTable_(sh).rows.forEach(function (r) {
    var id = String(r.card_id).trim(), lang = String(r.lang).trim().toLowerCase();
    if (!id || !lang) return;
    (out[id] = out[id] || {})[lang] = {
      text: text_(r.text), example: text_(r.example), status: String(r.status || 'machine'), updated: isoDateTime_(r.updated), _row: r._row
    };
  });
  return out;
}

/**
 * Upserts one translation (caller holds the lock). Empty text AND example removes the row. `status` defaults to
 * machine for a new row and is kept otherwise, unless given. `existing` (optional) = readTranslations_() result.
 */
function setTranslation_(cardId, lang, text, example, status, existing) {
  var sh = sheet_('Translations');
  var cur = ((existing || readTranslations_())[cardId] || {})[lang];
  text = String(text == null ? '' : text).trim();
  example = String(example == null ? '' : example).trim();
  if (!text && !example) {
    if (cur) sh.deleteRow(cur._row);
    return null;
  }
  var row = { card_id: cardId, lang: lang, text: text, example: example,
    status: status || (cur ? cur.status : 'machine'), updated: new Date() };
  var values = [rowFromObject_(SCHEMA.Translations, row)];
  if (cur) sh.getRange(cur._row, 1, 1, SCHEMA.Translations.length).setValues(values);
  else sh.getRange(nextRow_(sh, 1), 1, 1, SCHEMA.Translations.length).setValues(values);
  return row;
}

/** Sets the status of every translation of a card (e.g. reviewed when the owner approves the card). */
function setTranslationsStatus_(cardId, status) {
  var sh = tabOrNull_('Translations');
  if (!sh) return;
  var col = SCHEMA.Translations.indexOf('status') + 1;
  var byLang = readTranslations_()[cardId] || {};
  Object.keys(byLang).forEach(function (lang) { sh.getRange(byLang[lang]._row, col).setValue(status); });
}

/** Removes every row of `name` whose column `key` equals `id` (bottom-up). */
function deleteRowsWhere_(name, key, id) {
  var sh = tabOrNull_(name);
  if (!sh) return 0;
  var rows = readTable_(sh).rows.filter(function (r) { return String(r[key]) === String(id); })
    .sort(function (a, b) { return b._row - a._row; });
  rows.forEach(function (r) { sh.deleteRow(r._row); });
  return rows.length;
}

// ---------- Groups ----------

/** All groups: [{group_code, inst_id, display_name, languages:[..], active, content_version}]. */
function readGroups_() {
  var sh = tabOrNull_('Groups');
  if (!sh) return [];
  return readTable_(sh).rows.filter(function (r) { return String(r.group_code).trim(); }).map(function (r) {
    return {
      group_code: String(r.group_code).trim(), inst_id: String(r.inst_id || ''), display_name: String(r.display_name || ''),
      languages: splitTags_(r.languages), active: bool_(r.active), content_version: String(r.content_version || '')
    };
  });
}

/**
 * The group the owner-only pages work on (until the /docent/ page has a group picker): the first active group.
 * Throws when there is none (the sheet is not migrated yet).
 */
function defaultGroup_() {
  var g = readGroups_().filter(function (x) { return x.active; })[0];
  if (!g) throw apiError_('no_group', 'Er is nog geen actieve groep (eerst migrateV2 draaien).');
  return g;
}

/** group_code → card_id → status ('inbox' | 'accepted' | 'hidden'). */
function readGroupCards_() {
  var sh = tabOrNull_('GroupCards'), out = {};
  if (!sh) return out;
  readTable_(sh).rows.forEach(function (r) {
    var g = String(r.group_code).trim(), id = String(r.card_id).trim();
    if (g && id) (out[g] = out[g] || {})[id] = String(r.status || 'inbox').trim().toLowerCase();
  });
  return out;
}
