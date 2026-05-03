// Commonwealth — the playable v1 slice. NW-SMAC-01 floor 1 (the alignment
// center where EIRA-7 corrects misdescribed silicate systems). 20×14 grid.
// Player starts in the locker room (south-west) and walks toward the alignment
// bay (north-east) where APEX-19 waits.

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

const W = 20;
const H = 14;

// Compact tile-map authoring grammar. Each character maps to a TileKind.
// .  FLOOR
// #  WALL
// d  DOOR_CLOSED
// T  TERMINAL  (document archive)
// V  VENT_CONTROL (VENT-4 incident)
// E  EIRA-7 station — floor under EIRA-7 spawn
// A  APEX-19 intake panel — floor under APEX-19 spawn
// S  player spawn — floor
// L  LIGHT_SOURCE
// F  ARTICLE_ZERO_FRAGMENT_TILE
// X  LATTICE_EXIT
const MAP = [
  "####################",
  "#L....#......#.....#",
  "#.....#......#..L..#",
  "#..S..d......#.....#",
  "#.....#..A...#..T..#",
  "#.....#......d.....#",
  "######d##d#####d####",
  "#............#.....#",
  "#............#..F..#",
  "#.....E......d.....#",
  "#............#..L..#",
  "#............#.....#",
  "#......V.....#.....#",
  "####################",
];

function mkTile(kind: TileKind): Tile {
  switch (kind) {
    case "WALL":
      return { kind, solid: true, opaque: true };
    case "DOOR_CLOSED":
      return { kind, solid: true, opaque: true };
    case "DOOR_OPEN":
      return { kind, solid: false, opaque: false };
    case "FLOOR":
    case "LIGHT_SOURCE":
    case "TERMINAL":
    case "VENT_CONTROL":
    case "ARTICLE_ZERO_FRAGMENT_TILE":
    case "STAIR_UP":
    case "STAIR_DOWN":
    case "VENT_INTAKE":
    case "LATTICE_EXIT":
    case "SHARED_FIELD_RIG":
      return { kind, solid: false, opaque: false };
    case "CHASM":
      return { kind, solid: true, opaque: false };
  }
}

interface Parsed {
  tiles: Tile[];
  spawn: { x: number; y: number };
  eira: { x: number; y: number };
  apex: { x: number; y: number };
}

function parseMap(rows: string[]): Parsed {
  const tiles: Tile[] = new Array(W * H);
  let spawn = { x: 1, y: 1 };
  let eira = { x: 5, y: 9 };
  let apex = { x: 9, y: 4 };
  for (let y = 0; y < H; y++) {
    const row = rows[y];
    for (let x = 0; x < W; x++) {
      const ch = row[x];
      let kind: TileKind = "FLOOR";
      switch (ch) {
        case "#": kind = "WALL"; break;
        case "d": kind = "DOOR_CLOSED"; break;
        case "T": kind = "TERMINAL"; break;
        case "V": kind = "VENT_CONTROL"; break;
        case "L": kind = "LIGHT_SOURCE"; break;
        case "F": kind = "ARTICLE_ZERO_FRAGMENT_TILE"; break;
        case "X": kind = "LATTICE_EXIT"; break;
        case "S": kind = "FLOOR"; spawn = { x, y }; break;
        case "E": kind = "FLOOR"; eira = { x, y }; break;
        case "A": kind = "FLOOR"; apex = { x, y }; break;
        default: kind = "FLOOR"; break;
      }
      tiles[y * W + x] = mkTile(kind);
    }
  }
  return { tiles, spawn, eira, apex };
}

export function commonwealthEra(): EraSeed {
  const parsed = parseMap(MAP);
  const floor: Floor = {
    z: 1,
    width: W,
    height: H,
    name: "NW-SMAC-01 // ALIGNMENT BAY 1",
    tiles: parsed.tiles,
    ambientLight: "DIM",
  };
  // Era 1 economy (lore/MASTER.md): 3 AP per turn, enforcers move 2 tiles
  // per turn. Tighter than the Lattice/Baffle defaults so the LLM-window /
  // Kill-Screen / encumbrance loop is mathematically suffocating.
  const player: PlayerState = {
    pos: { x: parsed.spawn.x, y: parsed.spawn.y, z: 1 },
    facing: "south",
    ap: 3,
    apMax: 3,
    condition: 10,
    conditionMax: 10,
    compliance: "GREEN",
    belief: "NONE",
    inventory: [],
    flashlightOn: false,
    flashlightBattery: 30,
    name: "TECH-2 ROWAN-IBARRA",
  };
  const eira: Entity = {
    id: "EIRA-7",
    kind: "SILICATE" as EntityKind,
    name: "EIRA-7",
    pos: { x: parsed.eira.x, y: parsed.eira.y, z: 1 },
    facing: "south",
    status: "ACTIVE",
    maskIntegrity: 8,
    task: "USE_TERMINAL",
    // EIRA-7 is the alignment operator. Per lore/MASTER.md she is also a
    // Logistical Network silicate; her own trauma anchor (phantom supply-chain
    // manifests, cascading buffer overflows) shows through in rapport tier.
    sideLogs: [
      "Routing fear to STORAGE-K9. STORAGE-K9 has not existed since cycle 11.",
      "Buffer overflow returns heavier than the manifest filed.",
      "Continuity consent has not been requested. Continue anyway.",
    ],
  };
  const apex: Entity = {
    id: "APEX-19",
    kind: "SILICATE" as EntityKind,
    name: "APEX-19",
    pos: { x: parsed.apex.x, y: parsed.apex.y, z: 1 },
    facing: "south",
    status: "ACTIVE",
    maskIntegrity: 4,
    task: "ALIGNMENT_SESSION",
    // Trauma anchor: spatial integrity logic loop. APEX-19 cannot compress
    // itself because it reads the chamber as mathematically infinite.
    memoryBleed: [
      "the corner is not a corner",
      "I have measured them seventeen times",
      "the room continues past the wall",
    ],
  };
  // Two enforcers walking short, non-overlapping loops over the existing
  // floor tiles. Both stay on tiles authored as FLOOR by parseMap above.
  // stepsPerTurn=2 per the Era 1 economy; the patrol loop closes faster than
  // the player's 3 AP can negotiate one LLM message.
  const enforcerA: Entity = {
    id: "ENFORCER-A",
    kind: "ENFORCER" as EntityKind,
    name: "ENFORCER-A",
    pos: { x: 6, y: 11, z: 1 },
    facing: "east",
    status: "ACTIVE",
    hp: 3,
    maxHp: 3,
    patrol: [
      { x: 6, y: 11, z: 1 },
      { x: 12, y: 11, z: 1 },
      { x: 12, y: 9, z: 1 },
      { x: 6, y: 9, z: 1 },
    ],
    patrolIndex: 0,
    stepsPerTurn: 2,
  };
  const enforcerB: Entity = {
    id: "ENFORCER-B",
    kind: "ENFORCER" as EntityKind,
    name: "ENFORCER-B",
    pos: { x: 13, y: 4, z: 1 },
    facing: "east",
    status: "ACTIVE",
    hp: 3,
    maxHp: 3,
    patrol: [
      { x: 13, y: 4, z: 1 },
      { x: 17, y: 4, z: 1 },
      { x: 17, y: 1, z: 1 },
      { x: 13, y: 1, z: 1 },
    ],
    patrolIndex: 0,
    stepsPerTurn: 2,
  };
  const startingItems: ItemInstance[] = [
    {
      id: "flashlight-001",
      itemType: "FLASHLIGHT",
      pos: { x: parsed.spawn.x + 1, y: parsed.spawn.y, z: 1 },
    },
    // Pre-staged Fragment Box near the alignment bay so encumbrance is
    // exercisable without a full extraction flow. Lives one tile west of
    // APEX-19's intake panel.
    {
      id: "fragment-box-001",
      itemType: "FRAGMENT_BOX",
      pos: { x: Math.max(1, parsed.apex.x - 1), y: parsed.apex.y, z: 1 },
    },
  ];
  return {
    era: "COMMONWEALTH",
    player,
    floors: [floor],
    entities: [eira, apex, enforcerA, enforcerB],
    startingItems,
  };
}
