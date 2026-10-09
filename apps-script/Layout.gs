// Column widths + wrapping so every tab is readable without resizing. Applied by applyV2Formats_; layout only.

var LAYOUT = {
  Cards: { id: 110, type: 80, nl: 230, article: 60, pos: 170, example_nl: 260, tags: 170, flags: 120, answer: 260,
    added: 100, active: 70, status: 100 },
  Translations: { card_id: 110, lang: 60, text: 260, example: 300, status: 90, updated: 140 },
  GroupCards: { group_code: 100, card_id: 110, status: 90, updated: 140 },
  Institutions: { inst_id: 110, label: 220, active: 70 },
  Teachers: { teacher_id: 110, inst_id: 110, label: 160, key_hash: 200, active: 70, created: 100 },
  Groups: { group_code: 100, inst_id: 110, display_name: 160, languages: 100, active: 70, content_version: 150 },
  GroupTeachers: { group_code: 100, teacher_id: 110 },
  Curriculum: { group_code: 100, order: 70, tag: 160, regel: 90, datum: 110, percentage: 100, van_tags: 220, version: 70 },
  Proposals: { proposal_id: 110, group_code: 100, teacher_id: 110, type: 90, card_id: 110, nl: 200, example_nl: 240,
    note: 260, status: 90, created: 140 },
  AuditLog: { timestamp: 150, teacher_id: 110, action: 160, group_code: 100 },
  Tags: { tag: 120, label_nl: 170, label_fr: 170, description: 340, subject_nl: 130 },
  Settings: { key: 230, value: 90, description: 560 }
};
var WRAP = { nl: 1, example_nl: 1, answer: 1, description: 1, text: 1, example: 1, note: 1, pos: 1, tags: 1 };

function applyLayout_(ss) {
  Object.keys(LAYOUT).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var headers = headersOf_(sh);
    headers.forEach(function (h, i) {
      var w = LAYOUT[name][h];
      if (!w) return;
      sh.setColumnWidth(i + 1, w);
      sh.getRange(1, i + 1, sh.getMaxRows(), 1)
        .setWrapStrategy(WRAP[h] ? SpreadsheetApp.WrapStrategy.WRAP : SpreadsheetApp.WrapStrategy.CLIP);
    });
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(headers.length, 1)).setVerticalAlignment('top');
  });
}
