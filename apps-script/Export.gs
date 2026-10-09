// The export for publishing (spec › Publishing): every group with its word list, read by the deploy workflow with
// the read-only export key (scripts/build-content.mjs writes /g/<code>/content.json from it). Per active group: the
// approved cards it accepted AND that belong to its curriculum (a tag with a Curriculum row of the group — also a
// dicht row, so cards a student already started keep coming back), with translations in the group's languages
// only; its curriculum rows; the tags it uses; the settings. An inactive group is listed with active:false and no
// content, so the app can tell "stopped" from "unknown code".

function exportGroups_() {
  var groups = readGroups_();
  var cardsSh = sheet_('Cards');
  var t = readTable_(cardsSh);
  if (t.rows.some(function (r) { return String(r.nl).trim() && String(r.id).trim() === ''; })) {
    withLock_(function () { fillIds_(cardsSh); });
    t = readTable_(cardsSh);
  }
  var bank = t.rows.filter(cardServed_);
  var groupCards = readGroupCards_(), tr = readTranslations_();
  var tagNames = readTagTranslations_();
  var allTags = readTable_(sheet_('Tags')).rows.map(function (r) {
    var tag = String(r.tag).trim().toLowerCase();
    return { tag: tag, label_nl: String(r.label_nl || r.tag || ''), subject_nl: String(r.subject_nl || '').trim(), names: tagNames[tag] || {} };
  }).filter(function (x) { return x.tag; });
  var settings = readSettings_();
  var out = groups.map(function (g) {
    if (!g.active) return { code: g.group_code, active: false };
    var curriculum = readCurriculum_(g.group_code);
    var inCurriculum = {};
    curriculum.forEach(function (r) { if (r.tag) inCurriculum[r.tag] = true; });
    var accepted = groupCards[g.group_code] || {};
    var cards = bank.filter(function (r) {
      return accepted[String(r.id)] === 'accepted' && splitTags_(r.tags).some(function (x) { return inCurriculum[x]; });
    }).map(function (r) { return exportCard_(r, tr[String(r.id)] || {}, g.languages); });
    var used = {};
    cards.forEach(function (c) { c.tags.forEach(function (x) { used[x] = true; }); });
    curriculum.forEach(function (r) { used[r.tag] = true; });
    return {
      code: g.group_code, active: true, display_name: g.display_name, languages: g.languages,
      cards: cards, curriculum: curriculum, settings: settings,
      // Topic names only in the group's languages: {tag, label_nl, subject_nl, labels: {fr: …}}.
      tags: allTags.filter(function (x) { return used[x.tag]; }).map(function (x) {
        var labels = {};
        g.languages.forEach(function (l) { if (x.names[l]) labels[l] = x.names[l].label; });
        return { tag: x.tag, label_nl: x.label_nl, subject_nl: x.subject_nl, labels: labels };
      })
    };
  });
  return { env: env_(), exported_at: new Date().toISOString(), groups: out };
}

/** A card for a group's content.json: no status fields; translations {lang: {text, example}} in its languages. */
function exportCard_(r, tr, languages) {
  var translations = {};
  languages.forEach(function (l) { if (tr[l]) translations[l] = { text: tr[l].text, example: tr[l].example }; });
  return {
    id: String(r.id), type: typeCode_(r.type) || 'word', nl: text_(r.nl), article: String(r.article || ''),
    pos: String(r.pos || ''), example_nl: text_(r.example_nl), answer: text_(r.answer), tags: splitTags_(r.tags),
    flags: splitTags_(r.flags), added: isoDate_(r.added), active: true,
    // Until the app reads `translations` (phase 4): the French text as before.
    fr: translations.fr ? translations.fr.text : '', example_fr: translations.fr ? translations.fr.example : '',
    translations: translations
  };
}
