#!/bin/sh
# clasp with the SpeesRep Google account's own login file (never ~/.clasprc.json, which belongs to Fanki).
exec npx -y @google/clasp@3.4.1 -A "$HOME/.config/speesrep/.clasprc.json" "$@"
