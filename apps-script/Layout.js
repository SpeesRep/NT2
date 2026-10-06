// Column widths + wrapping so every tab is readable without resizing (Log is protected, so resizing it
// asks for confirmation). Applied by setup(); layout only — never touches values.

var LAYOUT = {
  Cards: { id: 110, type: 80, nl: 230, article: 60, pos: 170, fr: 230, example_nl: 260, example_fr: 260, tags: 170,
    flags: 120, answer: 260, added: 100, active: 70, controle: 120 },
  Inbox: { id: 110, type: 80, nl: 230, article: 60, pos: 170, fr: 230, example_nl: 260, example_fr: 260, tags: 170,
    flags: 120, answer: 260, added: 100, active: 70, status: 120 },
  Progress: { card_id: 130, track: 70, state: 100, due: 150, stability: 90, difficulty: 90, reps: 60, lapses: 60,
    last_review: 150 },
  Log: { event_id: 290, card_id: 130, track: 70, ts: 170, rating: 60, mode: 80, duration_ms: 100, snapshot: 600 },
  Tags: { tag: 120, label_nl: 170, label_fr: 170, description: 340, subject_nl: 130 },
  Settings: { key: 230, value: 90, description: 560 },
  Curriculum: { order: 70, tag: 160, regel: 90, datum: 110, percentage: 100, van_tags: 220 }
};
var WRAP = { nl: 1, fr: 1, example_nl: 1, example_fr: 1, answer: 1, description: 1, text_nl: 1, text: 1, pos: 1, tags: 1 };

function applyLayout_(ss) {
  Object.keys(LAYOUT).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
    headers.forEach(function (h, i) {
      var w = LAYOUT[name][h];
      if (!w) return;
      sh.setColumnWidth(i + 1, w);
      var col = sh.getRange(1, i + 1, sh.getMaxRows(), 1);
      col.setWrapStrategy(WRAP[h] ? SpreadsheetApp.WrapStrategy.WRAP : SpreadsheetApp.WrapStrategy.CLIP);
    });
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(headers.length, 1)).setVerticalAlignment('top');
  });
  var dash = ss.getSheetByName('Dashboard');
  if (dash) {
    [[1, 320], [2, 140], [3, 120], [4, 170], [5, 100], [6, 80], [7, 80], [8, 190], [9, 120]].forEach(function (c) {
      dash.setColumnWidth(c[0], c[1]);
    });
  }
}
