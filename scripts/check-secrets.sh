#!/usr/bin/env bash
# Blocks commits/pushes that contain tokens.
# Usage:
#   check-secrets.sh --staged        scan staged diff (pre-commit)
#   check-secrets.sh --range A..B    scan commits in range (pre-push)
#   check-secrets.sh --tree          scan tracked source files (CI; excludes dist/ node_modules/)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mode="${1:---staged}"
case "$mode" in
  --staged) content="$(git diff --cached -U0 --no-color | grep '^+' | grep -v '^+++' || true)" ;;
  --range)  shift; content="$(git log -p --no-color "$@" | grep '^+' | grep -v '^+++' || true)" ;;
  --tree)   content="$(git ls-files -z -- . ':!:dist' ':!:node_modules' ':!:package-lock.json' | xargs -0 cat 2>/dev/null || true)" ;;
  *) echo "unknown mode $mode"; exit 2 ;;
esac

fail=0
report() { echo "✗ secret check: $1" >&2; fail=1; }

# 1. Exact values from .env.local (tokens, never URLs' public parts)
if [[ -f .env.local ]]; then
  while IFS='=' read -r key val; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    val="${val%\"}"; val="${val#\"}"
    [[ ${#val} -lt 16 ]] && continue
    case "$key" in *TOKEN*|*SECRET*|*KEY*) ;; *) continue ;; esac
    if grep -qF -- "$val" <<<"$content"; then report "value of $key from .env.local found"; fi
  done < .env.local
fi

# 2. Generic patterns
patterns=(
  '(LEARNER|ADMIN)_TOKEN[A-Z_]*[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_-]{24,}'
  'ya29\.[A-Za-z0-9_-]{20,}'
  '"refresh_token"[[:space:]]*:[[:space:]]*"[^"]+'
  '"access_token"[[:space:]]*:[[:space:]]*"[^"]+'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'gh[pousr]_[A-Za-z0-9]{30,}'
  'AIza[0-9A-Za-z_-]{35}'
)
for p in "${patterns[@]}"; do
  if grep -Eq -- "$p" <<<"$content"; then report "pattern /$p/ matched"; fi
done

if [[ $fail -ne 0 ]]; then
  echo "Commit/push blocked. Remove the secret (see CLAUDE.md › Secrets)." >&2
  exit 1
fi
