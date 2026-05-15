// Shared tile constructor. Centralises the solid/opaque rules so the
// hand-authored eras and the Moose loader stay in lockstep.

import type { Tile, TileKind } from "../../types/world.types";

export function mkTile(kind: TileKind): Tile {
  switch (kind) {
    case "WALL":
    case "DOOR_CLOSED":
    case "LOCKER":
      return { kind, solid: true, opaque: true };
    default:
      return { kind, solid: false, opaque: false };
  }
}
