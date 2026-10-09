// v2 sheet formats: headers, validation lists, plain-text columns, widths. Applied by migrateV2 and by setup()
// (safe to re-run; never changes values). Columns are found by NAME, so the order in Schema.gs can change.

/** Editor entry point (owner): re-applies formats and validation to a migrated sheet. */
function setup() {
  var ss = ss_();
  if (headersOf_(ss.getSheetByName('Cards')).indexOf('status') === -1) throw new Error('Run the admin action migrateV2 first.');
  applyV2Formats_(ss);
  return ss.getUrl();
}

function list_(vals, help) {
  var b = SpreadsheetApp.newDataValidation().requireValueInList(vals, true).setAllowInvalid(false);
  return (help ? b.setHelpText(help) : b).build();
}

/** The 2:… range of column `name` in `sh`, or null when the tab has no such column. */
function col_(sh, name) {
  var i = headersOf_(sh).indexOf(name);
  return i === -1 ? null : sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1);
}

function applyV2Formats_(ss) {
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    sh.getRange(1, 1, 1, SCHEMA[name].length).setFontWeight('bold').setBackground('#e8eaed');
    sh.setFrozenRows(1);
  });
  var with_ = function (name, fn) { var sh = ss.getSheetByName(name); if (sh) fn(sh); };
  var text = function (sh, cols) { cols.forEach(function (c) { var r = col_(sh, c); if (r) r.setNumberFormat('@'); }); };
  var check = SpreadsheetApp.newDataValidation().requireCheckbox().build();

  with_('Cards', function (sh) {
    col_(sh, 'type').setDataValidation(list_(CARD_TYPES));
    col_(sh, 'article').setDataValidation(list_(['de', 'het']));
    col_(sh, 'status').setDataValidation(list_(CARD_STATUS, 'draft = nog te controleren · approved = goedgekeurd (kan naar groepen) · rejected = afgekeurd'));
    col_(sh, 'active').setDataValidation(check);
    col_(sh, 'added').setNumberFormat('yyyy-mm-dd');
    // Text stays text: otherwise Sheets turns "7:15" into a time and "1/2" into a date.
    text(sh, ['nl', 'example_nl', 'answer']);
    col_(sh, 'answer').clearDataValidations();
  });
  with_('Translations', function (sh) {
    col_(sh, 'lang').setDataValidation(list_(HELP_LANGS, 'Hulptaal (fr, en …)'));
    col_(sh, 'status').setDataValidation(list_(TRANSLATION_STATUS, 'machine = niet nagekeken · reviewed = nagekeken'));
    col_(sh, 'updated').setNumberFormat('yyyy-mm-dd hh:mm');
    text(sh, ['text', 'example']);
  });
  with_('GroupCards', function (sh) {
    col_(sh, 'status').setDataValidation(list_(GROUP_CARD_STATUS, 'inbox = wacht op de docent · accepted = leerlingen krijgen hem · hidden = verborgen'));
    col_(sh, 'updated').setNumberFormat('yyyy-mm-dd hh:mm');
  });
  with_('Groups', function (sh) { col_(sh, 'active').setDataValidation(check); text(sh, ['group_code', 'languages']); });
  with_('Institutions', function (sh) { col_(sh, 'active').setDataValidation(check); });
  with_('Teachers', function (sh) { col_(sh, 'active').setDataValidation(check); col_(sh, 'created').setNumberFormat('yyyy-mm-dd'); });
  with_('Curriculum', function (sh) {
    var tags = ss.getSheetByName('Tags');
    col_(sh, 'order').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(1)
      .setAllowInvalid(false).setHelpText('Volgorde (1, 2, 3…): bepaalt alleen welk open onderwerp eerst nieuwe kaarten geeft').build());
    col_(sh, 'tag').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(tags.getRange('A2:A'), true)
      .setAllowInvalid(false).setHelpText('Een tag uit het tabblad Tags').build());
    col_(sh, 'regel').setDataValidation(list_([RULE_NL.always, RULE_NL.date, RULE_NL.known, RULE_NL.closed],
      'altijd = meteen open · datum = open vanaf de datum · bekend = als genoeg kaarten van van_tags bekend zijn · dicht = gesloten'));
    col_(sh, 'datum').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
      .setHelpText('Alleen voor regel datum: open vanaf middernacht op deze dag').build()).setNumberFormat('yyyy-mm-dd');
    col_(sh, 'percentage').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(1, 100)
      .setAllowInvalid(false).setHelpText('Alleen voor regel bekend: heel getal 1–100').build());
    text(sh, ['group_code', 'van_tags']);
  });
  with_('Settings', function (sh) {
    readTable_(sh).rows.forEach(function (r) {
      if (r.key === 'show_french_help') sh.getRange(r._row, 2).setDataValidation(check);
    });
  });
  applyLayout_(ss);
}

/** Installable onEdit trigger: fills blank ids (and added/active/status) when the owner types a card into Cards. */
function onSheetEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === 'Cards') fillIds_(e.range.getSheet());
}

/** Every Cards row with content but no id gets a fresh random id; blank added/active/status get defaults. */
function fillIds_(sh) {
  var t = readTable_(sh), h = t.headers, changed = 0;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  t.rows.forEach(function (r) {
    if (!String(r.nl).trim()) return;
    var set = function (k, v) { sh.getRange(r._row, h.indexOf(k) + 1).setValue(v); changed++; };
    if (!String(r.id).trim()) set('id', newId_('c_'));
    if (r.added === '') set('added', today);
    if (r.active === '') set('active', true);
    if (h.indexOf('status') !== -1 && !String(r.status).trim()) set('status', 'draft');
  });
  return changed;
}
