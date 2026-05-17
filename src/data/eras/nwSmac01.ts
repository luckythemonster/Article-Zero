// NW-SMAC-01 — The Ibarra Uploads (The Vacuum Trap).
// Two Ed levels: "Main Floor" (the facility grid) and "Ducts" (the
// sub-floor vent network). Four vent openings on the main floor connect
// to matching ladder cells in the Ducts at the same grid coordinates.
//
// Authoring (lights & switches):
//   Paint LIGHT_SOURCE tiles in the Ed `light_source` layer of the Main
//   Floor. Paint LIGHT_SWITCH tiles in the Ed `light_switch` layer (any
//   wall cell adjacent to a reachable floor cell). from-moose auto-wires
//   each painted switch to control every LIGHT_SOURCE in the same room;
//   override `room.lightSwitches` here for per-switch granularity. The
//   engine handles cross-room "bleed" automatically — when a Main-Floor
//   vent tile is in the lit set, a small pool of light spills into the
//   matching ladder cell on the Ducts side, and the pool disappears when
//   the lights overhead are switched off.

import { mooseToEraSeed } from "./from-moose";
import type { MooseEraMeta } from "./from-moose";
import { mkTile } from "./tile-factory";
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
    player: {
      name: "TECH-2 ROWAN-IBARRA",
      // TODO(moose-export): drop `startPos` once the Main Floor export
      // carries a painted `spawn` marker layer.
      startPos: { x: 2, y: 4 },
    },
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
  const seed = mooseToEraSeed(NW_SMAC_01_LEVELS, meta);

  // TODO(moose-export): placeholder lights + switch on the Main Floor until
  // the painted Ed layers ship. Lets us verify the vent bleed-through to the
  // Ducts crawlspace before the re-export lands. Delete this whole block
  // (and the `LIGHT_SWITCH` push) once `light_source` and `light_switch`
  // layers are painted in Ed.
  const main = seed.rooms.find((r) => r.id === "main");
  if (main) {
    const stamp = (x: number, y: number, kind: "LIGHT_SOURCE" | "LIGHT_SWITCH") => {
      const idx = y * main.width + x;
      if (idx < 0 || idx >= main.tiles.length) return;
      main.tiles[idx] =
        kind === "LIGHT_SOURCE"
          ? mkTile("LIGHT_SOURCE", { emissionRadius: 5 })
          : mkTile("LIGHT_SWITCH");
    };
    stamp(5, 4, "LIGHT_SOURCE");  // near vent (4, 3) — proves bleed into Ducts (4, 3)
    stamp(5, 13, "LIGHT_SOURCE"); // near vent (4, 13) — proves bleed into Ducts (4, 13)
    // (29, 5) is already a LIGHT_SOURCE from the moose paint (existing 1546
    // stamp). Together with the two above we get three sparse lights.
    stamp(1, 4, "LIGHT_SWITCH");  // W cell adjacent to spawn — toggles all 3
    main.lightSwitches = [{ pos: { x: 1, y: 4 }, controls: [] }];
  }
  return seed;
}
