// Shared tile constructor. Centralises the solid/opaque rules so the
// hand-authored eras and the Moose loader stay in lockstep.

import type { Side, Tile, TileKind } from "../../types/world.types";

export interface MkTileOpts {
  elevation?: number;
  /** STAIRS only — destination elevation reached at the far side of the
   *  tile (`stairs_z<from>_z<to>` Ed convention). */
  elevationTo?: number;
  direction?: Side;
}

export function mkTile(kind: TileKind, opts: MkTileOpts = {}): Tile {
  const elevation = opts.elevation ?? 0;
  const direction = opts.direction;
  const elevationTo = opts.elevationTo;
  const extras = {
    ...(direction ? { direction } : {}),
    ...(elevationTo !== undefined ? { elevationTo } : {}),
  };
  switch (kind) {
    case "WALL":
    case "DOOR_CLOSED":
    case "LOCKER":
      return { kind, solid: true, opaque: true, elevation, ...extras };
    case "CHASM":
      return { kind, solid: true, opaque: false, elevation, ...extras };
    default:
      return { kind, solid: false, opaque: false, elevation, ...extras };
  }
}
