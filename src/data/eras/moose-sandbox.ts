// Moose sandbox era — loads a painted Moose level as a walkable map for
// visual end-to-end testing of the import pipeline. Picks the level with
// the most painted cells across all imported projects, so a freshly
// imported richer project automatically becomes the active sandbox map.
//
// No NPCs, no incidents, no RUN 01 trigger — just Sol on the imported
// floor so you can confirm tiles render and walls/floors behave.

import { eraSeedFromMooseLevel } from "./from-moose";
import {
  ARTICLE_ZERO_LEVELS,
} from "../tilesets/article_zero.levels";
import {
  ARTICLE_ZERO_TEXTURE_KEY,
} from "../tilesets/article_zero";
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

export function mooseSandboxEra(): EraSeed {
  // Pick the level with the most painted cells. Ties keep array order.
  const candidates = [...ARTICLE_ZERO_LEVELS];
  candidates.sort((a, b) => paintedCells(b) - paintedCells(a));
  const level = candidates[0] ?? ARTICLE_ZERO_LEVELS[0];

  return eraSeedFromMooseLevel(level, {
    era: "LATTICE", // borrow the era enum so subsystem ticks don't break
    floorIndex: 1,
    floorName: `MOOSE LEVEL // ${level.name}`,
    ambientLight: "LIT",
    textureKey: ARTICLE_ZERO_TEXTURE_KEY,
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
