#!/usr/bin/env bash
# Stage Lucky's VFX sprite-strips from
# `unmounted assets/added by Lucky/VFX sprites _lasers_explosions_energy.zip`
# into public/assets/vfx/ with web-safe filenames. Each effect ships a single-row,
# uniform, no-spacing `spritesheet.png` that Phaser's BootScene preloads via
# `load.spritesheet` and turns into a one-shot anim (see src/data/vfx/registry.ts).
# Frame sizes / counts live in the registry, derived from each spritesheet.txt.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$ROOT/unmounted assets/added by Lucky/VFX sprites _lasers_explosions_energy.zip"
DEST="$ROOT/public/assets/vfx"

mkdir -p "$DEST"

# zip-internal path : web-safe output name
declare -a MAP=(
  "stylized_explosion_002_large_violet/spritesheet.png:explosion_violet.png"
  "scifi_spark_burst_001_large_yellow/spritesheet.png:spark_yellow.png"
  "scifi_charge_up_001_large_yellow/spritesheet.png:charge_yellow.png"
  "lightning_burst_001_large_violet/spritesheet.png:lightning_violet_s.png"
  "lightning_burst_002_large_violet/spritesheet.png:lightning_violet_m.png"
  "lightning_burst_003_large_violet/spritesheet.png:lightning_violet_l.png"
  "scifi_warp_001/scifi_warp_001_large_green/spritesheet.png:warp_green_l.png"
  "scifi_warp_001/scifi_warp_001_small_green/spritesheet.png:warp_green_s.png"
  "scifi_warp_002/scifi_warp_002_large_red/spritesheet.png:warp_red_l.png"
  "scifi_warp_002/scifi_warp_002_small_red/spritesheet.png:warp_red_s.png"
  "scifi_warp_003/scifi_warp_003_large_blue/spritesheet.png:warp_blue_l.png"
  "scifi_warp_003/scifi_warp_003_small_blue/spritesheet.png:warp_blue_s.png"
)

for entry in "${MAP[@]}"; do
  src="${entry%%:*}"
  out="${entry##*:}"
  unzip -p "$ZIP" "$src" > "$DEST/$out"
done

echo "Mounted VFX art to $DEST"
ls "$DEST"
