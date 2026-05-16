// NW-SMAC-01 — The Ibarra Uploads (The Vacuum Trap).
// Two Ed levels: "Main Floor" (the facility grid) and "Ducts" (the
// sub-floor vent network). Four vent openings on the main floor connect
// to matching ladder cells in the Ducts at the same grid coordinates.

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
        levelName: "Main Floor",
        id: "main",
        displayName: "NW-SMAC-01 // MAIN FLOOR",
        ambient: "DIM",
      },
      {
        levelName: "Ducts",
        id: "ducts",
        displayName: "NW-SMAC-01 // DUCTS",
        ambient: "DARK",
        crawlspace: true,
      },
    ],
    startRoomId: "main",
    player: { name: "TECH-2 ROWAN-IBARRA" },
    doorways: [
      // Four vent openings on the main floor, each paired 1:1 with the
      // matching ladder cell in the Ducts at the same grid coordinate.
      {
        from: "main",
        to: "ducts",
        side: "N",
        localPos: { x: 4, y: 3 },
        landingPos: { x: 4, y: 3 },
        kind: "vent",
      },
      {
        from: "main",
        to: "ducts",
        side: "N",
        localPos: { x: 26, y: 4 },
        landingPos: { x: 26, y: 4 },
        kind: "vent",
      },
      {
        from: "main",
        to: "ducts",
        side: "N",
        localPos: { x: 4, y: 13 },
        landingPos: { x: 4, y: 13 },
        kind: "vent",
      },
      {
        from: "main",
        to: "ducts",
        side: "N",
        localPos: { x: 26, y: 14 },
        landingPos: { x: 26, y: 14 },
        kind: "vent",
      },
    ],
    entities: [],
  };
  return mooseToEraSeed(NW_SMAC_01_LEVELS, meta);
}
