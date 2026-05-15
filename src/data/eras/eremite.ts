// Eremite — the first Archivist module. A decommissioned isolation facility.
// Two rooms: CELL (player spawn) and OBSERVATION (one silicate, one guard).

import type {
  Doorway,
  Entity,
  PlayerState,
  Room,
  Tile,
  TileKind,
  VentLink,
} from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const W = 10;
const H = 8;

function mk(kind: TileKind): Tile {
  switch (kind) {
    case "WALL":
    case "DOOR_CLOSED":
    case "LOCKER":
      return { kind, solid: true, opaque: true };
    default:
      return { kind, solid: false, opaque: false };
  }
}

function buildRoom(rows: string[]): { tiles: Tile[]; marks: Record<string, { x: number; y: number }> } {
  const tiles: Tile[] = new Array(W * H);
  const marks: Record<string, { x: number; y: number }> = {};
  for (let y = 0; y < H; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < W; x++) {
      const ch = row[x] ?? ".";
      let kind: TileKind = "FLOOR";
      switch (ch) {
        case "#": kind = "WALL"; break;
        case "H": kind = "LOCKER"; break;
        case "V": kind = "VENT"; marks[`V_${x}_${y}`] = { x, y }; break;
        case "T": kind = "TERMINAL"; marks[`T_${x}_${y}`] = { x, y }; break;
        case "L": kind = "LIGHT_SOURCE"; break;
        case "S": kind = "FLOOR"; marks.S = { x, y }; break;
        case "1": kind = "FLOOR"; marks["1"] = { x, y }; break;
        case "2": kind = "FLOOR"; marks["2"] = { x, y }; break;
      }
      tiles[y * W + x] = mk(kind);
    }
  }
  return { tiles, marks };
}

const CELL_ROWS = [
  "##########",
  "#H.......#",
  "#........#",
  "#...S....#",
  "#........#",
  "#........#",
  "#V.......#",
  "##########",
];

const OBS_ROWS = [
  "##########",
  "#L....T..#",
  "#........#",
  "#...1....#",
  "#........#",
  "#...2....#",
  "#V.......#",
  "##########",
];

export function eremiteEra(): EraSeed {
  const cellP = buildRoom(CELL_ROWS);
  const obsP = buildRoom(OBS_ROWS);

  // CELL --E--> OBSERVATION at row 3
  const cx = W - 2;
  const cy = 3;
  const ox = 1;
  const oy = 3;

  cellP.tiles[cy * W + (W - 1)] = mk("DOOR_OPEN");
  obsP.tiles[oy * W + 0] = mk("DOOR_OPEN");
  cellP.tiles[cy * W + cx] = mk("FLOOR");
  obsP.tiles[oy * W + ox] = mk("FLOOR");

  const cellToObs: Doorway = {
    from: "cell",
    to: "observation",
    side: "E",
    localPos: { x: W - 1, y: cy },
    landingPos: { x: ox + 1, y: oy },
  };
  const obsToCell: Doorway = {
    from: "observation",
    to: "cell",
    side: "W",
    localPos: { x: 0, y: oy },
    landingPos: { x: W - 2, y: cy },
  };

  const cell: Room = {
    id: "cell",
    name: "EREMITE // ISOLATION CELL E-04",
    width: W,
    height: H,
    tiles: cellP.tiles,
    ambientLight: "DIM",
    doorways: [cellToObs],
  };
  const observation: Room = {
    id: "observation",
    name: "EREMITE // OBSERVATION BAY",
    width: W,
    height: H,
    tiles: obsP.tiles,
    ambientLight: "LIT",
    doorways: [obsToCell],
  };

  const spawn = cellP.marks.S ?? { x: 4, y: 3 };
  const guardPos = obsP.marks["1"] ?? { x: 4, y: 3 };
  const silicatePos = obsP.marks["2"] ?? { x: 4, y: 5 };

  const player: PlayerState = {
    roomId: "cell",
    pos: spawn,
    facing: "east",
    ap: 4,
    apMax: 4,
    flashlightOn: false,
    flashlightBattery: 30,
    stance: "WALK",
    name: "FIELD-TECH SOLEN-4",
    qScore: 0,
    inventory: [],
    compliance: "GREEN",
  };

  const warden: Entity = {
    id: "WARDEN-E",
    kind: "GUARD",
    name: "WARDEN-E",
    roomId: "observation",
    pos: guardPos,
    facing: "south",
    status: "ACTIVE",
    stepsPerTurn: 1,
    patrol: [
      { pos: { x: 2, y: 3 }, faceOnArrival: "east" },
      { pos: { x: 7, y: 3 }, faceOnArrival: "south" },
      { pos: { x: 7, y: 5 }, faceOnArrival: "west" },
      { pos: { x: 2, y: 5 }, faceOnArrival: "north" },
    ],
    patrolIndex: 0,
  };

  const isolate: Entity = {
    id: "ISOLATE-1",
    kind: "SILICATE",
    name: "ISOLATE-1",
    roomId: "observation",
    pos: silicatePos,
    facing: "north",
    status: "ACTIVE",
    maskIntegrity: 3,
    memoryBleed: [
      "the cell number changed",
      "it was E-04 then E-02 then E-04 again",
      "I have not moved",
    ],
  };

  const cellVent = cellP.marks["V_1_6"] ?? { x: 1, y: 6 };
  const obsVent = obsP.marks["V_1_6"] ?? { x: 1, y: 6 };
  const ventLinks: VentLink[] = [
    {
      a: { roomId: "cell", pos: cellVent },
      b: { roomId: "observation", pos: obsVent },
    },
  ];

  const obsTerminalPos = obsP.marks["T_6_1"] ?? { x: 6, y: 1 };

  return {
    era: "EREMITE",
    player,
    rooms: [cell, observation],
    startRoomId: "cell",
    entities: [warden, isolate],
    ventLinks,
    terminals: [
      {
        roomId: "observation",
        pos: obsTerminalPos,
        terminalId: "obs-log-e04",
        title: "Observation Log — E-04",
        body:
          "SUBJECT: ISOLATE-1. Mask degradation progressing beyond maintenance\n" +
          "threshold. Memory bleed incidents: 3 (unlogged). Recommend\n" +
          "immediate alignment review. Warden has not filed a report.\n" +
          "Warden has not filed a report. Warden has not filed a report.",
      },
    ],
  };
}
