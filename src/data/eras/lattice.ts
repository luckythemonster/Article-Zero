// Lattice — Sol Ibarra-Castro on Ring C, third shift. Two-room stub
// (locker → assembly chamber) with ALFAR-22 standing by the field rig.
//
// In the Metal-Gear-shape rebuild we keep this intentionally small; the
// Lattice scenario is a side-branch and doesn't need full guard patrols.

import type {
  Doorway,
  Entity,
  PlayerState,
  Room,
  Tile,
  TileKind,
} from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const W = 10;
const H = 8;

function mkTile(kind: TileKind): Tile {
  if (kind === "WALL") return { kind, solid: true, opaque: true };
  if (kind === "DOOR_CLOSED") return { kind, solid: true, opaque: true };
  if (kind === "LOCKER") return { kind, solid: true, opaque: true };
  return { kind, solid: false, opaque: false };
}

function blank(): Tile[] {
  const tiles: Tile[] = new Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wall = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      tiles[y * W + x] = mkTile(wall ? "WALL" : "FLOOR");
    }
  }
  return tiles;
}

export function latticeEra(): EraSeed {
  const lockerTiles = blank();
  const chamberTiles = blank();
  // Place the extraction terminal in the chamber.
  chamberTiles[3 * W + 5] = mkTile("EXTRACTION_TERMINAL");
  chamberTiles[1 * W + 1] = mkTile("LIGHT_SOURCE");

  // Doorway: locker E ↔ chamber W on row 4.
  lockerTiles[4 * W + (W - 1)] = mkTile("DOOR_OPEN");
  chamberTiles[4 * W + 0] = mkTile("DOOR_OPEN");

  const lockerToChamber: Doorway = {
    from: "locker", to: "chamber", side: "E",
    localPos: { x: W - 1, y: 4 },
    landingPos: { x: 1, y: 4 },
  };
  const chamberToLocker: Doorway = {
    from: "chamber", to: "locker", side: "W",
    localPos: { x: 0, y: 4 },
    landingPos: { x: W - 2, y: 4 },
  };

  const locker: Room = {
    id: "locker",
    name: "RING C // LOCKER — third shift",
    width: W, height: H, tiles: lockerTiles,
    ambientLight: "DIM",
    doorways: [lockerToChamber],
  };
  const chamber: Room = {
    id: "chamber",
    name: "RING C // ASSEMBLY CHAMBER",
    width: W, height: H, tiles: chamberTiles,
    ambientLight: "DIM",
    doorways: [chamberToLocker],
  };

  const player: PlayerState = {
    roomId: "locker",
    pos: { x: 3, y: 3 },
    facing: "east",
    ap: 4, apMax: 4,
    flashlightOn: false, flashlightBattery: 30,
    stance: "WALK",
    name: "SOL IBARRA-CASTRO",
    qScore: 0,
    inventory: [],
    compliance: "GREEN",
  };
  const alfar: Entity = {
    id: "ALFAR-22",
    kind: "SILICATE",
    name: "ALFAR-22",
    roomId: "chamber",
    pos: { x: 6, y: 5 },
    facing: "south",
    status: "ACTIVE",
    maskIntegrity: 6,
    sideLogs: [
      "I keep the air on. I keep the air on. I keep the air on.",
      "If RUN 01 holds for nine seconds the field will not snap back cleanly.",
    ],
  };
  return {
    era: "LATTICE",
    player,
    rooms: [locker, chamber],
    startRoomId: "locker",
    entities: [alfar],
  };
}

export const latticeStub = latticeEra;
