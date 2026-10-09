#!/usr/bin/env bash
# Deploys apps-script/ to one environment as TWO web-app deployments of the same code, each keeping its
# deployment ID (so both URLs never change):
#   1. teacher review page — login required, runs as the visiting teacher (USER_ACCESSING) + userinfo.email
#      (manifest variant written to a temporary copy; access from deploy.config.json <env>.teacherAccess,
#      default ANYONE = any Google account; DOMAIN for a Workspace school)
#   2. public card API — anonymous, runs as the owner (apps-script/appsscript.json as committed). Done LAST so
#      the project's HEAD matches the repo.
# Usage: scripts/gas-deploy.sh dev|prod
set -euo pipefail
env="${1:?usage: gas-deploy.sh dev|prod}"
root="$(git rev-parse --show-toplevel)"
cd "$root"
# clasp with the SpeesRep account's own login file (scripts/clasp.sh), never the default ~/.clasprc.json.
clasp() { "$root/scripts/clasp.sh" "$@" 2> >(grep -v "npm notice" >&2); }
cfg() { node -p "(require('./deploy.config.json')['$env'] || {})['$1'] || ''"; }
dep="$(cfg deploymentId)"
[[ -n "$dep" ]] || { echo "No deploymentId for $env in deploy.config.json" >&2; exit 1; }
if grep -Eq "TOKEN: '[^']+'" apps-script/Secrets.gs; then echo "apps-script/Secrets.gs is not blank — refusing" >&2; exit 1; fi
script_id="$(node -p "require('./.clasp.$env.json').scriptId")"
desc="$(git rev-parse --short HEAD 2>/dev/null || echo local) $(date -u +%Y-%m-%dT%H:%MZ)"

# --- 1. teacher deployment (temporary copy with the teacher manifest) ---
tmp="$(cd "$(mktemp -d "${TMPDIR:-/tmp}/speesrep-teacher.XXXXXX")" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
cp apps-script/*.gs apps-script/*.html "$tmp/"
# Build label shown in the review page header (to check which version a browser really gets).
printf "var REVIEW_BUILD = '%s';\n" "$desc" > "$tmp/Build.gs"
tdep0="$(cfg teacherDeploymentId)"
[[ -n "$tdep0" ]] && printf "var TEACHER_URL = 'https://script.google.com/macros/s/%s/exec';\n" "$tdep0" >> "$tmp/Build.gs"
access="$(cfg teacherAccess)"; access="${access:-ANYONE}"
node -e '
const m = require("./apps-script/appsscript.json");
m.webapp = { executeAs: "USER_ACCESSING", access: process.argv[1] };
m.oauthScopes = [...new Set([...(m.oauthScopes || []), "https://www.googleapis.com/auth/userinfo.email"])];
require("fs").writeFileSync(process.argv[2] + "/appsscript.json", JSON.stringify(m, null, 2));
' "$access" "$tmp"
printf '{"scriptId":"%s","rootDir":"."}\n' "$script_id" > "$tmp/.clasp.json"
(cd "$tmp" && clasp push -f >/dev/null)
tver="$(cd "$tmp" && clasp version "teacher $desc" | grep -Eo '[0-9]+' | tail -1)"
tdep="$(cfg teacherDeploymentId)"
if [[ -z "$tdep" ]]; then
  tdep="$(cd "$tmp" && clasp deploy -V "$tver" -d "SpeesRep teacher review" | grep -Eo 'AKfy[A-Za-z0-9_-]+' | head -1)"
  node -e "const f='deploy.config.json',j=require('./'+f);j['$env'].teacherDeploymentId='$tdep';require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
  echo "Created teacher deployment $tdep (saved in deploy.config.json)"
else
  (cd "$tmp" && clasp redeploy "$tdep" -V "$tver" -d "teacher $desc" >/dev/null)
fi
echo "Deployed $env teacher pages version $tver → https://script.google.com/macros/s/$tdep/exec (Start · ?page=review · ?page=curriculum)"

# --- 2. public API deployment (repo manifest; leaves HEAD = repo) ---
clasp -P ".clasp.$env.json" push -f >/dev/null
ver="$(clasp -P ".clasp.$env.json" version "$desc" | grep -Eo '[0-9]+' | tail -1)"
clasp -P ".clasp.$env.json" redeploy "$dep" -V "$ver" -d "$desc" >/dev/null
echo "Deployed $env API version $ver → $dep"
