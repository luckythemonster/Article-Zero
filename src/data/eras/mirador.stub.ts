// Mirador stub — Mara Ibarra's broadcast booth before a Bragg appearance.
// Teaser in v1: a single 10×6 room with one terminal, the rest behind
// "TRANSMISSION INCOMPLETE".

import type { Floor, PlayerState, Tile, TileKind } from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const W = 10;
const H = 6;

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

export function miradorStub(): EraSeed {
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
    name: "MIRADOR // CIVIX-1 BROADCAST BOOTH — TRANSMISSION INCOMPLETE",
    tiles,
    ambientLight: "LIT",
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
    name: "MARA IBARRA",
  };
  return { era: "MIRADOR", player, floors: [floor], entities: [], startingItems: [] };
}
