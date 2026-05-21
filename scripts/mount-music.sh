#!/usr/bin/env bash
# Stage NW-SMAC-01 music tracks from `unmounted assets/added by Lucky/` into
# public/audio/music/. Both BeepBox JSON sources are copied; the runtime
# synth (src/audio/BeepBox.ts) consumes them directly. Only `chase.json` is
# wired into MusicBridge at the moment.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/unmounted assets/added by Lucky"
DEST="$ROOT/public/audio/music"

mkdir -p "$DEST"
cp "$SRC_DIR/NW-SMAC-01 chase.json" "$DEST/chase.json"
cp "$SRC_DIR/NW-SMAC-01 theme.json" "$DEST/theme.json"

echo "Mounted music to $DEST"
ls "$DEST"
