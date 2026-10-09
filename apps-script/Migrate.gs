// One-off: Fanki sheet (v1) → SpeesRep v2 (multi-group). Admin action `migrateV2` (dry run unless dryRun:false).
//   - Backup first: Cards, Inbox, Curriculum, Tags, Settings are copied to hidden tabs v1_<name> (once).
//   - Cards keep their ids and columns, minus fr / example_fr / controle, plus `status`:
//     controle goedgekeurd → approved, afgekeurd → rejected, else draft.
//   - Inbox rows join Cards as drafts (afgekeurd → rejected), same id (a clash gets a new id, reported).
//   - fr / example_fr → Translations (lang fr; reviewed when the card is approved, else machine). An abbreviation
//     answer "het uur — heure (3:00u = drie uur)" keeps its Dutch part in `answer` and its French part goes to
//     Translations (the only language-specific text in `answer`).
//   - One Institution + one Group (random 8-character code, neutral name, languages fr,en); every approved card is
//     accepted in that group; the Curriculum rows get its group_code and version 1.
//   - Settings: require_approval is removed (only approved cards reach a group now).
//   - The Fanki tabs Inbox, Progress, Log, Dashboard, UserInfo are NOT deleted here (Inbox is hidden): Progress and
//     Log hold the Fanki learner's data — removing them is a separate, explicit step (deleteTabs).
// Resumable: it reads the v1 data from the v1_ backups once they exist, rewrites every v2 tab completely, and only
// the last step sets Script Property MIGRATED_V2. After that a run changes nothing (reports already_v2).

var V2_GROUP_NAME = 'Groep Zon';
var V2_INSTITUTION_LABEL = 'Eerste instelling';

/** "het uur — heure (3:00u = drie uur)" → {nl: "het uur (3:00u = drie uur)", other: "heure"}; null without " — ". */
function splitGloss_(answer) {
  var m = String(answer || '').match(/^(.*?)\s+—\s+(.*)$/);
  if (!m) return null;
  var after = m[2].trim(), paren = '';
  var p = after.match(/^(.*?)\s+(\([^()]*\))\s*$/); // only a parenthesis after a space is Dutch ("heure (3:00u = drie uur)"), not "minute(s)"
  if (p) { after = p[1].trim(); paren = ' ' + p[2]; }
  return { nl: m[1].trim() + paren, other: after };
}

/** The v1 row (Cards or Inbox) → {card, fr} without writing anything. */
function v1ToV2_(r, fromInbox) {
  var status;
  if (fromInbox) status = /^afgekeurd$/i.test(String(r.status || '').trim()) ? 'rejected' : 'draft';
  else status = cardStatus_(r.controle);
  var card = {};
  CARD_COLS.forEach(function (h) { card[h] = r[h] === undefined ? '' : r[h]; });
  card.status = status;
  if (card.active === '' || card.active === null) card.active = !fromInbox;
  var fr = { text: text_(r.fr).trim(), example: text_(r.example_fr).trim() };
  var gloss = splitTags_(r.flags).indexOf('abbreviation') !== -1 ? splitGloss_(r.answer) : null;
  if (gloss) {
    card.answer = gloss.nl;
    if (!fr.text) fr.text = gloss.other;
  }
  return { card: card, fr: fr, gloss: gloss };
}

/** Clears a tab completely — values, formats AND validation rules (clear() keeps those) — and writes the header. */
function resetTab_(sh, headers) {
  sh.clear();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}

function adminMigrateV2_(dryRun) {
  return withLock_(function () {
    var ss = ss_();
    if (props_().getProperty('MIGRATED_V2')) return { already_v2: props_().getProperty('MIGRATED_V2'), groups: readGroups_() };
    // The v1 data: from the backups when an earlier (interrupted) run made them, else from the live tabs.
    var src = function (name) { return ss.getSheetByName('v1_' + name) || ss.getSheetByName(name); };
    var cardsSh = ss.getSheetByName('Cards');
    if (headersOf_(src('Cards')).indexOf('status') !== -1) throw apiError_('not_v1', 'Cards has no v1 data (no v1_Cards backup).');
    var cards = readTable_(src('Cards')).rows.filter(function (r) { return String(r.id).trim() || String(r.nl).trim(); });
    var inboxSh = ss.getSheetByName('Inbox');
    var inbox = src('Inbox') ? readTable_(src('Inbox')).rows.filter(function (r) { return String(r.nl).trim(); }) : [];

    var seen = {}, renamed = [], out = [], glosses = [];
    var add = function (r, fromInbox) {
      var m = v1ToV2_(r, fromInbox);
      var id = String(m.card.id || '').trim();
      if (!id || seen[id]) {
        var fresh = newId_('c_');
        if (id) renamed.push(id + ' → ' + fresh + ' (' + m.card.nl + ')');
        m.card.id = id = fresh;
      }
      seen[id] = true;
      if (m.gloss) glosses.push(id + ': "' + r.answer + '" → answer "' + m.card.answer + '", fr "' + m.fr.text + '"');
      out.push(m);
    };
    cards.forEach(function (r) { add(r, false); });
    inbox.forEach(function (r) { add(r, true); });

    var count = { draft: 0, approved: 0, rejected: 0 };
    out.forEach(function (m) { count[m.card.status]++; });
    var translations = out.filter(function (m) { return m.fr.text || m.fr.example; });
    var curriculum = readTable_(src('Curriculum')).rows
      .filter(function (r) { return String(r.tag).trim() || String(r.regel).trim(); });
    var settings = readTable_(ss.getSheetByName('Settings')).rows;
    var code = newGroupCode_();
    var report = {
      dryRun: dryRun,
      cards: { from_cards: cards.length, from_inbox: inbox.length, total: out.length, status: count },
      translations_fr: translations.length,
      abbreviation_answers: glosses,
      renamed_ids: renamed,
      group: { group_code: code, display_name: V2_GROUP_NAME, languages: HELP_LANGS.join(','), accepted_cards: count.approved },
      curriculum_rows: curriculum.length,
      settings_removed: settings.filter(function (r) { return OBSOLETE_SETTINGS.indexOf(String(r.key).trim()) !== -1; }).map(function (r) { return r.key; }),
      resumed_from_backups: !!ss.getSheetByName('v1_Cards'),
      fanki_tabs_left: V1_TABS.filter(function (n) { return ss.getSheetByName(n); }).map(function (n) {
        return n + ' (' + Math.max(0, ss.getSheetByName(n).getLastRow() - 1) + ' rows)';
      })
    };
    if (dryRun) return report;

    // 1. Backups (hidden copies; never overwritten by a second run).
    ['Cards', 'Inbox', 'Curriculum', 'Tags', 'Settings'].forEach(function (n) {
      var sh = ss.getSheetByName(n);
      if (!sh || ss.getSheetByName('v1_' + n)) return;
      sh.copyTo(ss).setName('v1_' + n).hideSheet();
    });

    // The editor's undo tab had the v1 columns (its rows are in v1_Curriculum's history anyway): start it fresh.
    var oldBackup = ss.getSheetByName('Curriculum_backup');
    if (oldBackup) ss.deleteSheet(oldBackup);

    // 2. Cards: rewrite the tab with the v2 columns.
    resetTab_(cardsSh, CARD_COLS);
    if (out.length) {
      cardsSh.getRange(2, 1, out.length, CARD_COLS.length)
        .setValues(out.map(function (m) { return rowFromObject_(CARD_COLS, m.card); }));
    }

    // 3. New tabs.
    var now = new Date();
    var tab = function (name) { return resetTab_(ss.getSheetByName(name) || ss.insertSheet(name), SCHEMA[name]); };
    var put = function (sh, name, rows) {
      if (rows.length) sh.getRange(2, 1, rows.length, SCHEMA[name].length).setValues(rows.map(function (o) { return rowFromObject_(SCHEMA[name], o); }));
    };
    put(tab('Translations'), 'Translations', translations.map(function (m) {
      return { card_id: m.card.id, lang: 'fr', text: m.fr.text, example: m.fr.example,
        status: m.card.status === 'approved' ? 'reviewed' : 'machine', updated: now };
    }));
    var instId = newId_('i_');
    put(tab('Institutions'), 'Institutions', [{ inst_id: instId, label: V2_INSTITUTION_LABEL, active: true }]);
    tab('Teachers');
    put(tab('Groups'), 'Groups', [{ group_code: code, inst_id: instId, display_name: V2_GROUP_NAME,
      languages: HELP_LANGS.join(','), active: true, content_version: '' }]);
    tab('GroupTeachers');
    put(tab('GroupCards'), 'GroupCards', out.filter(function (m) { return m.card.status === 'approved'; })
      .map(function (m) { return { group_code: code, card_id: m.card.id, status: 'accepted', updated: now }; }));
    tab('Proposals');
    tab('AuditLog');

    // 4. Curriculum: same rows, now owned by the group.
    var curSh = ss.getSheetByName('Curriculum');
    var curRows = curriculum.map(function (r) {
      return { group_code: code, order: r.order, tag: r.tag, regel: r.regel, datum: r.datum, percentage: r.percentage,
        van_tags: r.van_tags, version: 1 };
    });
    resetTab_(curSh, SCHEMA.Curriculum);
    put(curSh, 'Curriculum', curRows);

    // 5. Settings without the obsolete keys (the live tab: a key removed by an earlier run stays removed).
    var setSh = ss.getSheetByName('Settings');
    readTable_(setSh).rows.filter(function (r) { return OBSOLETE_SETTINGS.indexOf(String(r.key).trim()) !== -1; })
      .sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { setSh.deleteRow(r._row); });

    // 6. Formats, validation, layout; the Inbox tab is hidden (its rows are drafts in Cards now).
    applyV2Formats_(ss);
    if (inboxSh) inboxSh.hideSheet();
    SpreadsheetApp.flush();
    props_().setProperty('MIGRATED_V2', new Date().toISOString());
    return report;
  });
}
