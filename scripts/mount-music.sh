#!/usr/bin/env bash
# Stage BeepBox music tracks from `unmounted assets/added by Lucky/` into
# public/audio/music/. The runtime synth (src/audio/BeepBox.ts) consumes the
# JSON sources directly. The two NW-SMAC-01 tracks keep their canonical
# chase.json/theme.json names (chase is wired into MusicBridge). The remaining
# songs Lucky staged (top-level extras + the music/ folder) are copied with
# slugified, web-safe filenames so they are available to load even though no
# trigger references them yet.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/unmounted assets/added by Lucky"
DEST="$ROOT/public/audio/music"

mkdir -p "$DEST"
cp "$SRC_DIR/NW-SMAC-01 chase.json" "$DEST/chase.json"
cp "$SRC_DIR/NW-SMAC-01 theme.json" "$DEST/theme.json"

slugify() {
  # lowercase, collapse any run of non-alphanumerics to a single hyphen, trim.
  printf '%s' "${1%.json}" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

shopt -s nullglob
# Copy all top-level .json files and contents of music/ subfolder
extras=( "$SRC_DIR"/*.json "$SRC_DIR"/music/*.json )
for src in "${extras[@]}"; do
  base="$(basename "$src")"
  # Skip NW-SMAC-01 files — they're handled separately below
  [[ "$base" == NW-SMAC-01* ]] && continue
  # Byte-identical to the already-live title-theme.json — skip the duplicate.
  [ "$base" = "Article Zero Title Theme finalish.json" ] && continue
  cp "$src" "$DEST/$(slugify "$base").json"
done

echo "Mounted music to $DEST"
ls "$DEST"
