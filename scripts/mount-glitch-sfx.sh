#!/usr/bin/env bash
# Stage the 25 hand-picked Glitch Noises wavs from `unmounted assets/added
# by Lucky/` into public/audio/glitch/<slug>.wav and emit a sibling
# index.json describing each clip (logical slug, URL, default volume,
# whether it loops by default, category).
#
# The runtime (src/audio/Sfx.ts) fetches /audio/glitch/index.json on
# preload, then lazily fetches + decodes each wav on first play —
# matches the Footsteps.ts pattern, not the eager jsfxr renderAll path.
#
# Source pack: Glitch Noises by Vladislav Zharkov (vladislavzh.net),
# distributed under CC0 1.0 Universal per the bundled Read Me.pdf.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/unmounted assets/added by Lucky"
DEST="$ROOT/public/audio/glitch"

rm -rf "$DEST"
mkdir -p "$DEST"

# Mapping table: source-basename-without-_VZ_GN.wav | slug | category | loop | defaultVolume
ENTRIES=(
  "AMBDsgn_Ground Floor|ambient.ground-floor|ambient|true|0.30"
  "AMBTech_Computer Room|ambient.computer-room|ambient|true|0.30"
  "CMPTDriv_Decryption Server|ambient.decryption-server|ambient|true|0.35"
  "CMPTMisc_Machine Dreaming|ambient.machine-dreaming|ambient|true|0.25"
  "SCIAlrm_Biohazard (Dry)|alarm.biohazard|alarm|true|0.55"
  "SCIAlrm_Decontamination (Wet)|alarm.decontamination|alarm|true|0.55"
  "SCIAlrm_Incoming (Dry)|alarm.incoming|alarm|false|0.60"
  "UIMvmt_Scroll 001|ui.scroll|ui|false|0.55"
  "UIClick_Click 005|ui.click|ui|false|0.55"
  "UIClick_Select 001|ui.select|ui|false|0.60"
  "UIAlert_Cancel 001|ui.cancel|ui|false|0.60"
  "UIData_Processing Complete 001|ui.processing-complete|ui|false|0.60"
  "UIData_Reading 001|data.reading|data|true|0.45"
  "UIData_Scrubbing 001|data.scrubbing|data|true|0.50"
  "UIData_Screeching 001|data.screeching|data|true|0.50"
  "DSGNRise_Confirm Deletion|rise.confirm-deletion|rise|false|0.55"
  "DSGNRise_Kernel Panic|rise.kernel-panic|rise|false|0.65"
  "COMStatic_Interference Tone 001|comm.interference-tone|comm|true|0.30"
  "COMTran_Intercom In 001|comm.intercom-in|comm|false|0.65"
  "COMTran_Intercom Out 001|comm.intercom-out|comm|false|0.65"
  "COMTelm_Telemetry Broken 001|comm.telemetry-broken|comm|true|0.40"
  "DSGNWhsh_Dystopian|glitch.dystopian|glitch|false|0.55"
  "DSGNWhsh_Lo-Fi Memories|glitch.lofi-memories|glitch|false|0.55"
  "UIGlitch_Distortion 001|glitch.distortion|glitch|false|0.55"
  "UIGlitch_Bit 001|glitch.bit|glitch|false|0.55"
)

JSON="$DEST/index.json"
{
  printf '['
  first=1
  for entry in "${ENTRIES[@]}"; do
    IFS='|' read -r base slug category loop vol <<<"$entry"
    src="$SRC_DIR/${base}_VZ_GN.wav"
    if [ ! -f "$src" ]; then
      echo "missing source: $src" >&2
      exit 1
    fi
    cp "$src" "$DEST/${slug}.wav"
    if [ $first -eq 1 ]; then
      first=0
    else
      printf ','
    fi
    printf '\n  {"name":"%s","file":"/audio/glitch/%s.wav","defaultVolume":%s,"loop":%s,"category":"%s"}' \
      "$slug" "$slug" "$vol" "$loop" "$category"
  done
  printf '\n]\n'
} > "$JSON"

echo "Mounted ${#ENTRIES[@]} glitch sfx to $DEST"
ls "$DEST"
