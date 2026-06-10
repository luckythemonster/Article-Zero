// Mirador stub — Mara Ibarra's broadcast booth. Single room teaser.

import type { PlayerState, Room, Tile, TileKind } from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const W = 10;
const H = 6;

function mk(kind: TileKind): Tile {
  if (kind === "WALL") return { kind, solid: true, opaque: true, elevation: 0 };
  if (kind === "DOOR_CLOSED") return { kind, solid: true, opaque: true, elevation: 0 };
  if (kind === "LOCKER") return { kind, solid: true, opaque: true, elevation: 0 };
  return { kind, solid: false, opaque: false, elevation: 0 };
}

export function miradorEra(): EraSeed {
  const tiles: Tile[] = new Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wall = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      tiles[y * W + x] = mk(wall ? "WALL" : "FLOOR");
    }
  }
  tiles[2 * W + 6] = mk("EXTRACTION_TERMINAL");

  const room: Room = {
    id: "booth",
    name: "MIRADOR // CIVIX-1 BROADCAST BOOTH — TRANSMISSION INCOMPLETE",
    width: W, height: H, tiles, ambientLight: "LIT",
    doorways: [],
  };
  const player: PlayerState = {
    roomId: "booth",
    pos: { x: 3, y: 2 },
    z: 0,
    facing: "south",
    ap: 4, apMax: 4,
    flashlightOn: false, flashlightBattery: 30,
    stance: "WALK",
    name: "MARA IBARRA",
    qScore: 0,
    inventory: [],
    compliance: "GREEN", objectives: [],
  };
  return {
    era: "MIRADOR",
    player,
    rooms: [room],
    startRoomId: "booth",
    entities: [],
  };
}

export const miradorStub = miradorEra;
