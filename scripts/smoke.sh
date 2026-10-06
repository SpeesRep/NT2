#!/usr/bin/env bash
# Smoke-tests a deployed API with curl. HTTP is always 200: assertions are on the JSON body.
# Usage: scripts/smoke.sh dev|prod      (tokens are read from .env.local and never printed)
set -uo pipefail
env="${1:?usage: smoke.sh dev|prod}"; E="$(tr '[:lower:]' '[:upper:]' <<<"$env")"
cd "$(git rev-parse --show-toplevel)"
set -a; source .env.local; set +a
url_var="API_URL_$E"; l_var="LEARNER_TOKEN_$E"; a_var="ADMIN_TOKEN_$E"
URL="${!url_var}"; LT="${!l_var}"; AT="${!a_var}"
[[ -n "$URL" ]] || { echo "API_URL_$E missing in .env.local"; exit 1; }
pass=0; fail=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ ${1:0:200}"; fail=$((fail+1)); }
get() { # retries when Google serves an HTML error page instead of the script output
  local out i
  for i in 1 2 3 4; do
    out="$(curl -sSL -m 60 "$URL?$1")"
    [[ "$out" == \{* ]] && { echo "$out"; return; }
    echo "    (GET retry $i: non-JSON response)" >&2; sleep "$i"
  done
  echo "$out"
}
post() { # retries when the body was lost on a redirect (no_action) or response is not JSON
  local out i
  for i in 1 2 3 4; do
    out="$(curl -sSL -m 60 -H 'Content-Type: text/plain;charset=utf-8' --data-binary "$1" "$URL")"
    if node -e 'const j=JSON.parse(process.argv[1]); process.exit(j.error==="no_action"||j.error==="busy"?1:0)' "$out" 2>/dev/null; then echo "$out"; return; fi
    echo "    (POST retry $i)" >&2; sleep "$i"
  done
  echo "$out"
}
q() { node -e 'const j=JSON.parse(process.argv[1]); const f=new Function("j","return ("+process.argv[2]+")"); console.log(f(j))' "$1" "$2" 2>/dev/null || echo "PARSE_ERROR"; }

echo "Smoke test $E"
r="$(get action=ping)"
[[ "$(q "$r" 'j.ok && j.env')" == "$E" ]] && ok "ping → env $E" || bad "ping: $r"

r="$(get "action=cards&token=$LT")"
n="$(q "$r" 'j.ok ? j.cards.length : -1')"
gate="$(q "$r" 'j.ok && j.settings.require_approval === true')"
min=1; [[ "$E" == "PROD" || "$gate" == "true" ]] && min=0   # PROD starts empty; with require_approval only approved cards
[[ "$n" -ge "$min" ]] && ok "cards → $n active cards, $(q "$r" 'j.tags.length') tags" || bad "cards: $(q "$r" 'j.error')"
if [[ "$E" == "DEV" && "$gate" != "true" ]]; then
  [[ "$(q "$r" '["huis","opstaan","Ik {woon} in een klein huis.","Hoe heet je?"].every(x=>j.cards.some(c=>c.nl===x))')" == "true" ]] && ok "seed cards present (word, separable, cloze, question)" || bad "seed cards missing"
fi
[[ "$(q "$r" 'typeof j.settings.desired_retention')" == "number" ]] && ok "settings → retention $(q "$r" 'j.settings.desired_retention'), new/day $(q "$r" 'j.settings.new_per_day')" || bad "settings"

r="$(get "action=state&token=$LT")"
[[ "$(q "$r" 'j.ok && Array.isArray(j.progress)')" == "true" ]] && ok "state → $(q "$r" 'j.progress.length') progress rows" || bad "state: $r"

r="$(get "action=cards&token=wrong")"
[[ "$(q "$r" 'j.ok===false && j.error')" == "unauthorized" ]] && ok "bad token → {ok:false,error:unauthorized}" || bad "bad token not rejected: $r"

r="$(post "{\"action\":\"listUntagged\",\"token\":\"$LT\"}")"
[[ "$(q "$r" 'j.ok===false && j.error')" == "forbidden" ]] && ok "learner token cannot call admin actions" || bad "learner admin access: $(q "$r" 'j.error')"

ev="smoke-$(date +%s)-$RANDOM"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
body="{\"action\":\"reviews\",\"token\":\"$LT\",\"events\":[{\"event_id\":\"$ev\",\"card_id\":\"__smoke__\",\"track\":\"recog\",\"ts\":\"$now\",\"rating\":3,\"mode\":\"nl_fr\",\"duration_ms\":1234,\"snapshot\":{\"state\":\"Review\",\"due\":\"2099-01-01T00:00:00Z\",\"stability\":1,\"difficulty\":5,\"reps\":1,\"lapses\":0}}]}"
r1="$(post "$body")"; r2="$(post "$body")"
# A retried first POST (reply lost on Google's redirect) is correctly answered "duplicate": both are fine.
[[ "$(q "$r1" 'j.ok && (j.accepted.length + j.duplicate.length)')" == "1" ]] && ok "POST review → stored" || bad "first POST: $r1"
[[ "$(q "$r2" 'j.ok && j.duplicate.length')" == "1" ]] && ok "same POST again → duplicate" || bad "second POST: $r2"
r="$(post "{\"action\":\"readTab\",\"tab\":\"Log\",\"token\":\"$AT\"}")"
c="$(q "$r" "j.values.filter(v=>v[0]==='$ev').length")"
[[ "$c" == "1" ]] && ok "Log contains the event exactly once" || bad "Log count for event = $c"

r="$(post "{\"action\":\"purgeSmoke\",\"token\":\"$AT\"}")"
[[ "$(q "$r" 'j.ok')" == "true" ]] && ok "cleaned up $(q "$r" 'j.removed') smoke rows" || bad "purge: $r"

echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
