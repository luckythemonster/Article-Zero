// Arc 1 maps beta sandbox — walks Sol around the imported Arc 1 levels for
// visual end-to-end testing. Picks the most-painted level automatically.
// No NPCs, no incidents — just tiles and locomotion.

import { eraSeedFromMooseLevel } from "./from-moose";
import { ARC_1_MAPS_BETA_LEVELS } from "../tilesets/arc_1_maps_beta.levels";
import { ARC_1_MAPS_BETA_TEXTURE_KEY } from "../tilesets/arc_1_maps_beta";
import type { MooseLevel } from "../tilesets/types";
import type { EraSeed } from "../../engine/WorldEngineState";

function paintedCells(level: MooseLevel): number {
  let n = 0;
  for (const ly of level.layers) {
    for (const row of ly.data) {
      for (const c of row) if (c > 0) n += 1;
    }
  }
  return n;
}

export function arc1BetaEra(): EraSeed {
  const candidates = [...ARC_1_MAPS_BETA_LEVELS];
  candidates.sort((a, b) => paintedCells(b) - paintedCells(a));
  const level = candidates[0] ?? ARC_1_MAPS_BETA_LEVELS[0];

  return eraSeedFromMooseLevel(level, {
    era: "LATTICE",
    floorIndex: 1,
    floorName: `ARC 1 BETA // ${level.name}`,
    ambientLight: "LIT",
    textureKey: ARC_1_MAPS_BETA_TEXTURE_KEY,
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
