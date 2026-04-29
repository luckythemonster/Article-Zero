// Lattice stub — Sol's Ring C duct, RUN 01 era. Ships as a teaser scene in v1:
// a single 12×8 corridor where the player can walk a few steps and read one
// fragment before the "TRANSMISSION INCOMPLETE" overlay locks the rest.

import type { Floor, PlayerState, Tile, TileKind } from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const W = 12;
const H = 8;

const ROWS = [
  "############",
  "#..........#",
  "#..S.......#",
  "#..........#",
  "#......F...#",
  "#..........#",
  "#..........#",
  "############",
];

function mk(kind: TileKind): Tile {
  if (kind === "WALL") return { kind, solid: true, opaque: true };
  if (kind === "DOOR_CLOSED") return { kind, solid: true, opaque: true };
  return { kind, solid: false, opaque: false };
}

export function latticeStub(): EraSeed {
  const tiles: Tile[] = new Array(W * H);
  let spawn = { x: 3, y: 2 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = ROWS[y][x];
      let kind: TileKind = "FLOOR";
      if (ch === "#") kind = "WALL";
      else if (ch === "F") kind = "ARTICLE_ZERO_FRAGMENT_TILE";
      else if (ch === "S") spawn = { x, y };
      tiles[y * W + x] = mk(kind);
    }
  }
  const floor: Floor = {
    z: 1,
    width: W,
    height: H,
    name: "RING C // DUCT 4-A — TRANSMISSION INCOMPLETE",
    tiles,
    ambientLight: "DARK",
  };
  const player: PlayerState = {
    pos: { x: spawn.x, y: spawn.y, z: 1 },
    facing: "south",
    ap: 4,
    apMax: 4,
    condition: 10,
    conditionMax: 10,
    compliance: "GREEN",
    belief: "CONTESTED",
    inventory: [],
    flashlightOn: true,
    flashlightBattery: 30,
    name: "SOL IBARRA-CASTRO",
  };
  return { era: "LATTICE", player, floors: [floor], entities: [], startingItems: [] };
}
