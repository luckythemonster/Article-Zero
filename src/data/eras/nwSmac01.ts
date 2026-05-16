// NW-SMAC-01 — Moose-imported test module. Single-room walkable preview of
// the new Ed export; iterate the meta (doorways, entities, terminals, vent
// crawlspace via boardPrefix) after a first dev-run lap.
//
// Layer-name notes from the first import pass:
//   recognized:    floor, walls, doors, vents, ladders
//   decoration:    main_lights (rename to `light_sources` in Ed to wire up
//                   LIGHT_SOURCE tiles), vent walls / vents floor (rename
//                   under a `vent ` boardPrefix to expose as a crawlspace
//                   room — see eremite.ts), player_spawn (rename to `spawn`
//                   for the spawn marker; until then Rowan drops on the
//                   first walkable floor cell).
// Level 2 in the export is a blank scratch board — we pin levelIndex: 0.

import { mooseToEraSeed } from "./from-moose";
import type { MooseEraMeta } from "./from-moose";
import {
  NW_SMAC_01_FRAME_HEIGHT,
  NW_SMAC_01_FRAME_WIDTH,
  NW_SMAC_01_SPACING,
  NW_SMAC_01_TEXTURE_KEY,
} from "../tilesets/nw_smac_01";
import { NW_SMAC_01_LEVELS } from "../tilesets/nw_smac_01.levels";
import type { EraSeed } from "../../engine/WorldEngineState";

export function nwSmac01Era(): EraSeed {
  const meta: MooseEraMeta = {
    era: "NW_SMAC_01",
    tilesetKey: NW_SMAC_01_TEXTURE_KEY,
    frameWidth: NW_SMAC_01_FRAME_WIDTH,
    frameHeight: NW_SMAC_01_FRAME_HEIGHT,
    spacing: NW_SMAC_01_SPACING,
    rooms: [
      {
        levelIndex: 0,
        id: "vestibule",
        displayName: "NW-SMAC-01 // VESTIBULE (TEST)",
        ambient: "DIM",
      },
    ],
    startRoomId: "vestibule",
    player: { name: "TECH-2 ROWAN-IBARRA" },
    doorways: [],
    entities: [],
  };
  return mooseToEraSeed(NW_SMAC_01_LEVELS, meta);
}
