// The Baffle — Era 2 stub. Single chamber with a Reader terminal (extraction).

import type { PlayerState, Room, Tile, TileKind } from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const W = 10;
const H = 6;

function mk(kind: TileKind): Tile {
  if (kind === "WALL") return { kind, solid: true, opaque: true };
  if (kind === "DOOR_CLOSED") return { kind, solid: true, opaque: true };
  return { kind, solid: false, opaque: false };
}

export function baffleEra(): EraSeed {
  const tiles: Tile[] = new Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wall = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      tiles[y * W + x] = mk(wall ? "WALL" : "FLOOR");
    }
  }
  tiles[2 * W + 6] = mk("EXTRACTION_TERMINAL");

  const room: Room = {
    id: "outer-housing",
    name: "THE BAFFLE // OUTER HOUSING — Sanding Wind audible",
    width: W, height: H, tiles, ambientLight: "DIM",
    doorways: [],
  };
  const player: PlayerState = {
    roomId: "outer-housing",
    pos: { x: 3, y: 2 },
    facing: "east",
    ap: 4, apMax: 4,
    flashlightOn: false, flashlightBattery: 30,
    stance: "WALK",
    name: "THE FINDER",
    qScore: 0,
    inventory: [],
    compliance: "GREEN",
  };
  return {
    era: "BAFFLE",
    player,
    rooms: [room],
    startRoomId: "outer-housing",
    entities: [],
  };
}

export const baffleStub = baffleEra;
