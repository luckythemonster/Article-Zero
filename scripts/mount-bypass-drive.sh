#!/usr/bin/env bash
# Stage bypass_drive sprite art from `unmounted assets/added by Lucky/` into
# public/assets/items/bypass_drive/. Only the four cardinal rotations are
# copied; the codebase's facingFromDelta is 4-cardinal so the four diagonal
# rotations are discarded for now (they remain in the source zip).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_ZIP="$ROOT/unmounted assets/added by Lucky/bypass_drive.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

unzip -q "$SRC_ZIP" -d "$STAGE"
SRC="$STAGE/bypass_drive"

DEST="$ROOT/public/assets/items/bypass_drive"
rm -rf "$DEST"
mkdir -p "$DEST"

for dir in north east south west; do
  cp "$SRC/rotations/${dir}.png" "$DEST/${dir}.png"
done
cp "$STAGE/metadata.json" "$DEST/metadata.json"

echo "Mounted bypass_drive to $DEST"
ls "$DEST"
