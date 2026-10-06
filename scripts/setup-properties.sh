#!/bin/sh
# Usage: scripts/setup-properties.sh dev|prod
# Writes a TEMPORARY apps-script/SetupProperties.js (git-ignored) with the admin token from secrets.tmp.env
# and pushes it. Run setupProperties() once in the Apps Script editor, then: scripts/setup-properties.sh <env> --remove
# The sheet ids (the speesrep@gmail.com copies, never Fanki's) are in sheets.json.
set -eu
cd "$(dirname "$0")/.."; ROOT=$(pwd)
ENV_LC=$1; ENV_UC=$(echo "$ENV_LC" | tr a-z A-Z)
case $ENV_LC in dev|prod) ;; *) echo "dev or prod"; exit 1;; esac
F=apps-script/SetupProperties.js
if [ "${2:-}" = "--remove" ]; then
  rm -f "$F"
  # clasp 3.4.1 skips a push when the only change is a deleted file ("already up to date"), so push from a
  # temporary copy with a one-line stamp in Secrets.gs; the next normal push restores the repo version.
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/speesrep-remove.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
  cp apps-script/*.gs apps-script/*.html apps-script/appsscript.json "$tmp/"
  printf '\n// pushed %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$tmp/Secrets.gs"
  printf '{"scriptId":"%s","rootDir":"."}\n' "$(node -p "require('./.clasp.$ENV_LC.json').scriptId")" > "$tmp/.clasp.json"
  (cd "$tmp" && "$ROOT/scripts/clasp.sh" push -f 2>&1 | grep -v 'npm notice' | tail -1)
  mkdir "$tmp/check" && cp "$tmp/.clasp.json" "$tmp/check/"
  (cd "$tmp/check" && "$ROOT/scripts/clasp.sh" pull >/dev/null 2>&1)
  if ls "$tmp/check" | grep -qi setupprop; then echo "SetupProperties is STILL on the server"; exit 1; fi
  echo "SetupProperties removed from $ENV_UC"
  exit 0
fi
SHEET=$(node -p "require('./sheets.json').$ENV_UC")
TOKEN=$(grep "^ADMIN_TOKEN_$ENV_UC=" secrets.tmp.env | cut -d= -f2-)
[ -n "$TOKEN" ] || { echo "no ADMIN_TOKEN_$ENV_UC in secrets.tmp.env"; exit 1; }
umask 077
cat > "$F" <<JS
// TEMPORARY — git-ignored, removed again after one run. Sets ALL Script Properties of this project and the trigger.
function setupProperties() {
  var ss = SpreadsheetApp.openById('$SHEET');
  if (ss.getName().indexOf('$ENV_UC') === -1) throw new Error('Sheet "' + ss.getName() + '" is not the $ENV_UC sheet.');
  var p = PropertiesService.getScriptProperties();
  var old = p.getProperties();
  Logger.log('Old properties (names only): ' + Object.keys(old).join(', '));
  if (old.SHEET_ID && old.SHEET_ID !== ss.getId()) Logger.log('Old SHEET_ID pointed to ANOTHER sheet — replaced.');
  p.deleteAllProperties();
  p.setProperties({
    ENV: '$ENV_UC',
    SHEET_ID: ss.getId(),
    ADMIN_TOKEN: '$TOKEN',
    MIGRATED_NL: '3',
    TEACHER_EMAILS: 'speesrep@gmail.com'
  });
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  Logger.log('Done: ' + Object.keys(p.getProperties()).join(', ') + ' — sheet "' + ss.getName() + '"; trigger onSheetEdit.');
}
JS
./scripts/clasp.sh -P ".clasp.$ENV_LC.json" push -f 2>&1 | grep -v 'npm notice' | tail -1
