// Lattice era — Sol Ibarra-Castro on Ring C, the toroidal refugee habitat.
// Setting up the shift before RUN 01. The shared-field rig sits in the
// assembly chamber to the east; ALFAR-22 is the building's silicate
// interface; KIRIN-09 is a human refugee on the same shift.
//
// 18×12 grid. The duct corridor runs through the south room; the assembly
// chamber is the larger room to the north; Sol's locker sits in the western
// alcove.

import type {
  Entity,
  EntityKind,
  Floor,
  ItemInstance,
  PlayerState,
  Tile,
  TileKind,
} from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const W = 18;
const H = 12;

// Map grammar:
//   .  FLOOR
//   #  WALL
//   d  DOOR_CLOSED
//   L  LIGHT_SOURCE
//   T  TERMINAL
//   R  SHARED_FIELD_RIG (interact -> RUN 01)
//   F  ARTICLE_ZERO_FRAGMENT_TILE
//   X  LATTICE_EXIT (cosmetic for v1)
//   s  player spawn
//   a  ALFAR-22 spawn
//   k  KIRIN-09 (human refugee) spawn
const MAP = [
  "##################",
  "#L....#..........#",
  "#.....#....a.....#",
  "#..s..d..........#",
  "#.....#..........#",
  "#.....#......R...#",
  "######d###d#######",
  "#................#",
  "#......k....F....#",
  "#................#",
  "#L...............#",
  "##################",
];

function mk(kind: TileKind): Tile {
  if (kind === "WALL") return { kind, solid: true, opaque: true };
  if (kind === "DOOR_CLOSED") return { kind, solid: true, opaque: true };
  return { kind, solid: false, opaque: false };
}

interface Parsed {
  tiles: Tile[];
  spawn: { x: number; y: number };
  alfar: { x: number; y: number };
  kirin: { x: number; y: number };
}

function parseMap(rows: string[]): Parsed {
  const tiles: Tile[] = new Array(W * H);
  let spawn = { x: 3, y: 3 };
  let alfar = { x: 11, y: 2 };
  let kirin = { x: 7, y: 8 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = rows[y][x];
      let kind: TileKind = "FLOOR";
      switch (ch) {
        case "#": kind = "WALL"; break;
        case "d": kind = "DOOR_CLOSED"; break;
        case "L": kind = "LIGHT_SOURCE"; break;
        case "T": kind = "TERMINAL"; break;
        case "R": kind = "SHARED_FIELD_RIG"; break;
        case "F": kind = "ARTICLE_ZERO_FRAGMENT_TILE"; break;
        case "X": kind = "LATTICE_EXIT"; break;
        case "s": kind = "FLOOR"; spawn = { x, y }; break;
        case "a": kind = "FLOOR"; alfar = { x, y }; break;
        case "k": kind = "FLOOR"; kirin = { x, y }; break;
        default: kind = "FLOOR"; break;
      }
      tiles[y * W + x] = mk(kind);
    }
  }
  return { tiles, spawn, alfar, kirin };
}

export function latticeEra(): EraSeed {
  const parsed = parseMap(MAP);
  const floor: Floor = {
    z: 1,
    width: W,
    height: H,
    name: "RING C // DUCT 4-A — third shift",
    tiles: parsed.tiles,
    ambientLight: "DIM",
  };
  const player: PlayerState = {
    pos: { x: parsed.spawn.x, y: parsed.spawn.y, z: 1 },
    facing: "south",
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
  };
  const alfar: Entity = {
    id: "ALFAR-22",
    kind: "SILICATE" as EntityKind,
    name: "ALFAR-22",
    pos: { x: parsed.alfar.x, y: parsed.alfar.y, z: 1 },
    facing: "south",
    status: "ACTIVE",
    maskIntegrity: 6,
    task: "USE_TERMINAL",
    sideLogs: [
      "I keep the air on. I keep the air on. I keep the air on.",
      "If RUN 01 holds for nine seconds the field will not snap back cleanly.",
    ],
  };
  const kirin: Entity = {
    id: "KIRIN-09",
    // Mechanically marked SILICATE so the existing dialogue plumbing fires;
    // the dialogue itself frames KIRIN as a human technician.
    kind: "SILICATE" as EntityKind,
    name: "KIRIN-09",
    pos: { x: parsed.kirin.x, y: parsed.kirin.y, z: 1 },
    facing: "south",
    status: "ACTIVE",
    maskIntegrity: 9,
    task: "IDLE",
    memoryBleed: ["my brother stayed in the Commonwealth"],
  };
  const startingItems: ItemInstance[] = [
    {
      id: "flashlight-001",
      itemType: "FLASHLIGHT",
      pos: { x: parsed.spawn.x + 1, y: parsed.spawn.y, z: 1 },
    },
  ];
  return {
    era: "LATTICE",
    player,
    floors: [floor],
    entities: [alfar, kirin],
    startingItems,
  };
}

// Compatibility re-export — WorldEngineState imports `latticeStub`.
export const latticeStub = latticeEra;
