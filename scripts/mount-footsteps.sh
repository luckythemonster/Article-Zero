#!/usr/bin/env bash
# Stage Walk + Run footstep wavs from `unmounted assets/footsteps/` on
# origin/main into public/audio/footsteps/<surface>/{walk,run}_NN.wav.
#
# Jump_Start / Jump_Land wavs are skipped — no jump verb in the engine.
# Surface folder names are lowercased; variant numbers are re-sequenced
# contiguously so missing source numbers (e.g. wood walk 09) collapse out.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

git -C "$ROOT" archive origin/main "unmounted assets/footsteps" | tar -x -C "$STAGE"
SRC="$STAGE/unmounted assets/footsteps"

declare -A SURFACES=(
  [DirtyGround]=dirtyground
  [Gravel]=gravel
  [MetalV1]=metalv1
  [MetalV2]=metalv2
  [Rock]=rock
  [Tile]=tile
  [Wood]=wood
)

DEST="$ROOT/public/audio/footsteps"
rm -rf "$DEST"
mkdir -p "$DEST"

for surf in "${!SURFACES[@]}"; do
  lc="${SURFACES[$surf]}"
  mkdir -p "$DEST/$lc"
  for action in Walk Run; do
    lcact="$(echo "$action" | tr '[:upper:]' '[:lower:]')"
    i=1
    # Sort lexically so the renumbering is deterministic.
    while IFS= read -r src; do
      [ -z "$src" ] && continue
      printf -v n "%02d" "$i"
      cp "$src" "$DEST/$lc/${lcact}_${n}.wav"
      i=$((i+1))
    done < <(find "$SRC" -maxdepth 1 -name "Footsteps_${surf}_${action}_*.wav" | sort)
  done
done

echo "Mounted footsteps to $DEST"
find "$DEST" -type f | wc -l
