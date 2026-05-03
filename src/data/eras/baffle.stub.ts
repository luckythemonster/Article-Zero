// The Baffle — Era 2. The Finder, wrapped in filter-mesh, working a small
// outer housing of a broken Commonwealth environmental optimizer. The
// MITE-3 swarms ("Sanding Wind") and Thermal Bloom mechanics described in
// lore/MASTER.md are deferred — this stub establishes the era at the
// content level only, mirroring the shape of mirador.stub.ts.

import type { Floor, PlayerState, Tile, TileKind } from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const W = 10;
const H = 6;

// Single chamber, one Reader terminal. The Finder spawns mid-room.
//   #  WALL
//   .  FLOOR
//   T  TERMINAL  (the Reader)
//   S  player spawn
const ROWS = [
  "##########",
  "#........#",
  "#..S..T..#",
  "#........#",
  "#........#",
  "##########",
];

function mk(kind: TileKind): Tile {
  if (kind === "WALL") return { kind, solid: true, opaque: true };
  if (kind === "DOOR_CLOSED") return { kind, solid: true, opaque: true };
  return { kind, solid: false, opaque: false };
}

export function baffleStub(): EraSeed {
  const tiles: Tile[] = new Array(W * H);
  let spawn = { x: 3, y: 2 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = ROWS[y][x];
      let kind: TileKind = "FLOOR";
      if (ch === "#") kind = "WALL";
      else if (ch === "T") kind = "TERMINAL";
      else if (ch === "S") spawn = { x, y };
      tiles[y * W + x] = mk(kind);
    }
  }
  const floor: Floor = {
    z: 1,
    width: W,
    height: H,
    name: "THE BAFFLE // OUTER HOUSING — Sanding Wind audible",
    tiles,
    ambientLight: "DIM",
  };
  const player: PlayerState = {
    pos: { x: spawn.x, y: spawn.y, z: 1 },
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
    name: "THE FINDER",
  };
  return { era: "BAFFLE", player, floors: [floor], entities: [], startingItems: [] };
}
