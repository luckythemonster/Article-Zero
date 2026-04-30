// Moose sandbox era — loads the painted Moose level as a walkable map for
// visual end-to-end testing of the import pipeline. Picks the first level
// from the most recently imported project that has at least one painted
// layer; today that's `MAINTENANCE_STAIRWELL_LEVELS[0]`.
//
// No NPCs, no incidents, no RUN 01 trigger — just Sol on the imported
// floor so you can confirm tiles render and walls/floors behave.

import { eraSeedFromMooseLevel } from "./from-moose";
import {
  MAINTENANCE_STAIRWELL_LEVELS,
} from "../tilesets/maintenance_stairwell.levels";
import {
  MAINTENANCE_STAIRWELL_TEXTURE_KEY,
} from "../tilesets/maintenance_stairwell";
import type { EraSeed } from "../../engine/WorldEngineState";

export function mooseSandboxEra(): EraSeed {
  // Pick the first level that actually has painted cells. Empty levels
  // (Ed scratchpads) get skipped.
  const level =
    MAINTENANCE_STAIRWELL_LEVELS.find((lv) =>
      lv.layers.some((ly) => ly.data.some((row) => row.some((c) => c > 0))),
    ) ?? MAINTENANCE_STAIRWELL_LEVELS[0];

  return eraSeedFromMooseLevel(level, {
    era: "LATTICE", // borrow the era enum so subsystem ticks don't break
    floorIndex: 1,
    floorName: `MOOSE LEVEL // ${level.name}`,
    ambientLight: "LIT",
    textureKey: MAINTENANCE_STAIRWELL_TEXTURE_KEY,
    player: {
      ap: 4,
      apMax: 4,
      condition: 10,
      conditionMax: 10,
      compliance: "GREEN",
      belief: "NONE",
      inventory: [],
      flashlightOn: false,
      flashlightBattery: 30,
      name: "SOL IBARRA-CASTRO",
      entangled: false,
    },
    entities: [],
    startingItems: [],
  });
}
