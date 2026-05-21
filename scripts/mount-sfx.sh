#!/usr/bin/env bash
# Stage the jsfxr SFX definitions from `unmounted assets/added by Lucky/`
# into public/audio/sfx/. The runtime (src/audio/Sfx.ts) fetches the file
# and parses it via src/audio/jsfxr.ts → parseJsfxrDump(), so the
# plaintext dump format is consumed as-is.
#
# Lucky uploads each batch of new sounds as a separate `sounds*` file
# (e.g. `sounds`, `sounds 2`). We concatenate them in order so later
# files override earlier ones for any name collisions — last write wins,
# which matches the Record<name, params> semantics of parseJsfxrDump.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/unmounted assets/added by Lucky"
DEST="$ROOT/public/audio/sfx"

mkdir -p "$DEST"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

shopt -s nullglob
# Sort lexicographically so `sounds`, `sounds 2`, `sounds 3`… apply in
# the order Lucky added them.
for f in "$SRC_DIR"/sounds*; do
  cat "$f" >> "$TMP"
  printf '\n' >> "$TMP"
done

mv "$TMP" "$DEST/defs.txt"
trap - EXIT

echo "Mounted SFX defs to $DEST"
ls "$DEST"
