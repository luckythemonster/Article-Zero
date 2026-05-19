#!/usr/bin/env bash
# Stage the jsfxr SFX definitions from `unmounted assets/added by Lucky/`
# into public/audio/sfx/. The runtime (src/audio/Sfx.ts) fetches the file
# and parses it via src/audio/jsfxr.ts → parseJsfxrDump(), so the
# plaintext dump format is consumed as-is.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/unmounted assets/added by Lucky/sounds"
DEST="$ROOT/public/audio/sfx"

mkdir -p "$DEST"
cp "$SRC" "$DEST/defs.txt"

echo "Mounted SFX defs to $DEST"
ls "$DEST"
