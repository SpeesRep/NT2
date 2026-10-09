// Admin-only actions (ADMIN_TOKEN; scripts/admin.mjs or the Admin workflow). The Fanki one-off migrations are gone;
// Phase 2 of the multi-group spec replaces this with hashed admin keys and the admin.* actions.

/** Every card of the bank with its translations: [{…card, status, translations:{fr:{text, example, status}}}]. */
function adminListCards_() {
  var tr = readTranslations_();
  return { cards: readTable_(sheet_('Cards')).rows.filter(function (r) { return r.id; })
    .map(function (r) { return cardToJson_(r, tr[String(r.id)]); }) };
}

/** Lists tags (+ their names per language); optionally appends new ones: add = [{tag, label_nl, description}]. */
function adminTags_(add) {
  var sh = sheet_('Tags');
  var added = [];
  if (Array.isArray(add) && add.length) {
    withLock_(function () {
      var existing = readTable_(sh).rows.map(function (r) { return String(r.tag).trim().toLowerCase(); });
      add.forEach(function (t) {
        var tag = String(t && t.tag || '').trim().toLowerCase();
        if (!/^[a-z0-9-]{2,30}$/.test(tag) || existing.indexOf(tag) !== -1) return;
        var row = { tag: tag, label_nl: String(t.label_nl || tag), description: String(t.description || '') };
        sh.getRange(nextRow_(sh, 1), 1, 1, SCHEMA.Tags.length).setValues([rowFromObject_(SCHEMA.Tags, row)]);
        existing.push(tag);
        added.push(tag);
      });
    });
  }
  var tt = readTagTranslations_();
  var tags = readTable_(sh).rows.map(function (r) {
    var tag = String(r.tag).trim().toLowerCase(), labels = {};
    Object.keys(tt[tag] || {}).forEach(function (l) { labels[l] = tt[tag][l].label; });
    return { tag: tag, label_nl: String(r.label_nl || ''), labels: labels, description: String(r.description || '') };
  }).filter(function (x) { return x.tag; });
  return { tags: tags, added: added };
}

/** Raw values of one tab (a v2 tab, a Fanki tab that still exists, or its v1_ backup). */
function adminReadTab_(tab, rows) {
  var name = String(tab || '');
  if (!SCHEMA[name] && V1_TABS.indexOf(name) === -1 && !/^v1_[A-Za-z]+$/.test(name)) throw apiError_('bad_request', 'Unknown tab ' + name);
  var sh = ss_().getSheetByName(name);
  if (!sh) throw apiError_('missing_tab', 'Missing tab ' + name);
  var last = rows ? Math.min(Number(rows), sh.getMaxRows()) : sh.getLastRow();
  var values = last >= 1 ? sh.getRange(1, 1, last, Math.max(sh.getLastColumn(), 1)).getValues() : [];
  return { lastRow: sh.getLastRow(), values: values };
}

/**
 * Deletes Fanki tabs that v2 no longer uses: {tabs:[...]} from V1_TABS only (Progress and Log hold the Fanki
 * learner's data). Dry run unless dryRun:false; reports the rows each tab has.
 */
function adminDeleteTabs_(tabs, dryRun) {
  return withLock_(function () {
    var ss = ss_();
    var report = { dryRun: dryRun, tabs: [] };
    (tabs || []).forEach(function (name) {
      if (V1_TABS.indexOf(name) === -1) throw apiError_('bad_request', 'only ' + V1_TABS.join(', ') + ' may be deleted');
      var sh = ss.getSheetByName(name);
      if (!sh) { report.tabs.push(name + ': not there'); return; }
      report.tabs.push(name + ': ' + Math.max(0, sh.getLastRow() - 1) + ' rows');
      if (!dryRun) ss.deleteSheet(sh);
    });
    return report;
  });
}

/** Changes the value of one known Settings key: {key, value}; adds the row when missing. Dry run unless dryRun:false. */
function adminSetSetting_(key, value, dryRun) {
  var def = SETTINGS_DEFAULTS.filter(function (d) { return d[0] === key; })[0];
  if (!def) throw apiError_('bad_request', 'unknown setting ' + key);
  var v = typeof def[1] === 'number' ? Number(value) : typeof def[1] === 'boolean' ? bool_(value) : String(value);
  if (typeof def[1] === 'number' && !isFinite(v)) throw apiError_('bad_request', key + ' must be a number');
  return withLock_(function () {
    var sh = sheet_('Settings');
    var row = readTable_(sh).rows.filter(function (r) { return String(r.key).trim() === key; })[0];
    var report = { dryRun: dryRun, key: key, from: row ? row.value : '(no row: added)', to: v };
    if (dryRun) return report;
    if (row) sh.getRange(row._row, 2).setValue(v);
    else sh.appendRow([key, v, def[2]]);
    return report;
  });
}
