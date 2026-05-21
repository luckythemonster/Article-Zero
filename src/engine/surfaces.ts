// Map a tile to its footstep-surface family. Consumed by the audio bridge to
// pick a sample pool. Tiles that the player cannot stand on (walls, doors,
// terminals, chasms, etc.) return null so the bridge can bail without warning.

import type { Room, SurfaceType, Tile } from "../types/world.types";

export function tileSurface(tile: Tile, room: Room): SurfaceType | null {
  switch (tile.kind) {
    case "FLOOR":
      return room.floorSurface ?? "dirtyground";
    case "VENT":
      return "metalv2";
    case "STAIRS":
    case "LADDER":
      return "metalv1";
    default:
      return null;
  }
}
