#!/usr/bin/env bash
# Stage Lucky's UI art from `unmounted assets/added by Lucky/UI tests/` into
# public/assets/ui/ with web-safe filenames. These are consumed by React/CSS
# (status bar pip, title-screen glitch backdrop) — not by the Phaser BootScene —
# so no atlas/preload wiring is needed. The Chakra mockups in that folder
# (`ui (404, Title, etc).json`, `Alert Windows`) are intentionally not mounted.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/unmounted assets/added by Lucky/UI tests"
DEST="$ROOT/public/assets/ui"

mkdir -p "$DEST"

cp "$SRC/64x64 grid tile.png"               "$DEST/grid-tile.png"
cp "$SRC/glitch grid tile spritesheet.png"  "$DEST/glitch-spritesheet.png"
cp "$SRC/animated glitch tile.gif"          "$DEST/glitch-tile.gif"
cp "$SRC/compliance pips.png"               "$DEST/compliance-pips.png"

for n in 0 1 2 3 4; do
  cp "$SRC/ap dial $n.png"                  "$DEST/ap-dial-$n.png"
done

echo "Mounted UI art to $DEST"
ls "$DEST"
