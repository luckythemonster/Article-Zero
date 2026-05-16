// Shared tile constructor. Centralises the solid/opaque rules so the
// hand-authored eras and the Moose loader stay in lockstep.

import type { Side, Tile, TileKind } from "../../types/world.types";

export interface MkTileOpts {
  elevation?: number;
  direction?: Side;
}

export function mkTile(kind: TileKind, opts: MkTileOpts = {}): Tile {
  const elevation = opts.elevation ?? 0;
  const direction = opts.direction;
  switch (kind) {
    case "WALL":
    case "DOOR_CLOSED":
    case "LOCKER":
      return { kind, solid: true, opaque: true, elevation, ...(direction ? { direction } : {}) };
    case "CHASM":
      return { kind, solid: true, opaque: false, elevation, ...(direction ? { direction } : {}) };
    default:
      return { kind, solid: false, opaque: false, elevation, ...(direction ? { direction } : {}) };
  }
}
