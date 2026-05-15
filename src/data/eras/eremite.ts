// EREMITE — the first Archivist module. A decommissioned isolation
// facility, painted in Ed/Chilling Moose. One Ed level backs three Rooms:
//
//   main        — un-prefixed boards (`floor 0`, `walls 0`, `doors 0`,
//                  `terminal 0`, `vents 0`, `light_source 0`, `chasm`,
//                  `ladders 0`)
//   lower       — `level -1 *` boards, visible through the main-deck
//                  chasms; reached via two ladders
//   crawlspace  — `vent *` boards (vent walls, vent shaft, vent light
//                  source); reached only from CREEP at the painted vent
//                  cells on main
//
// The painted DOOR_CLOSED cells on main are NOT yet paired in meta — the
// loader emits no doorway for them, so they render as closed but cannot
// be crossed. Authoring pass after first dev-run will assign pairings.

import { mooseToEraSeed } from "./from-moose";
import type { MooseEraMeta } from "./from-moose";
import {
  EREMITE_MAP_FRAME_HEIGHT,
  EREMITE_MAP_FRAME_WIDTH,
  EREMITE_MAP_SPACING,
  EREMITE_MAP_TEXTURE_KEY,
} from "../tilesets/eremite_map";
import { EREMITE_MAP_LEVELS } from "../tilesets/eremite_map.levels";
import type { EraSeed } from "../../engine/WorldEngineState";

export function eremiteEra(): EraSeed {
  const meta: MooseEraMeta = {
    era: "EREMITE",
    tilesetKey: EREMITE_MAP_TEXTURE_KEY,
    frameWidth: EREMITE_MAP_FRAME_WIDTH,
    frameHeight: EREMITE_MAP_FRAME_HEIGHT,
    spacing: EREMITE_MAP_SPACING,
    rooms: [
      {
        levelName: "Level 1",
        id: "main",
        displayName: "EREMITE // MAIN DECK",
        ambient: "DIM",
      },
      {
        levelName: "Level 1",
        id: "lower",
        displayName: "EREMITE // LOWER DECK",
        ambient: "DARK",
        boardPrefix: "level -1 ",
      },
      {
        levelName: "Level 1",
        id: "crawlspace",
        displayName: "EREMITE // VENT NETWORK",
        ambient: "DARK",
        boardPrefix: "vent ",
        crawlspace: true,
      },
    ],
    startRoomId: "main",
    player: { name: "FIELD-TECH SOLEN-4" },
    doorways: [
      // Two ladders on main → lower at the painted LADDER cells (9,20)
      // and (42,20). Rooms share coordinate origin via the cropped Ed
      // level, so the same (x,y) means the same cell in both rooms.
      // Internal-kind doorways: the mirror lives at the landing cell;
      // re-entering the cell crosses back.
      {
        from: "main",
        to: "lower",
        side: "N",
        localPos: { x: 9, y: 20 },
        landingPos: { x: 9, y: 20 },
        kind: "ladder",
      },
      {
        from: "main",
        to: "lower",
        side: "N",
        localPos: { x: 42, y: 20 },
        landingPos: { x: 42, y: 20 },
        kind: "ladder",
      },
      // One vent on main → crawlspace at painted VENT cell (40,20),
      // landing on the navigable shaft cell (42,21). The painted vent
      // at (9,20) is shadowed by a ladder there (same cell) — the
      // ladder doorway wins doorwayAt lookup, so a second vent doorway
      // would be dead code. Single vent path is enough for v1.
      // CREEP stance + VENT_AP_COST enforced by WorldEngineActions.
      {
        from: "main",
        to: "crawlspace",
        side: "N",
        localPos: { x: 40, y: 20 },
        landingPos: { x: 42, y: 21 },
        kind: "vent",
      },
      // TODO: 4 painted DOOR_CLOSED cells on main deck need pairing.
      // Render closed; cannot be crossed until declared here.
    ],
    entities: [],
    terminals: [
      // 3 painted TERMINAL cells along y=48 on main (raw Ed coords).
      // After crop bbox starts at x=24, y=29 the room-local x is raw-24.
      {
        roomId: "main",
        pos: { x: 17, y: 19 },
        terminalId: "eremite-term-1",
        title: "TERMINAL",
        body: "[placeholder]",
      },
      {
        roomId: "main",
        pos: { x: 24, y: 19 },
        terminalId: "eremite-term-2",
        title: "TERMINAL",
        body: "[placeholder]",
      },
      {
        roomId: "main",
        pos: { x: 31, y: 19 },
        terminalId: "eremite-term-3",
        title: "TERMINAL",
        body: "[placeholder]",
      },
    ],
  };
  return mooseToEraSeed(EREMITE_MAP_LEVELS, meta);
}
