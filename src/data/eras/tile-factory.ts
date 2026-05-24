// Shared tile constructor. Centralises the solid/opaque rules so the
// hand-authored eras and the Moose loader stay in lockstep.

import type { Side, Tile, TileKind } from "../../types/world.types";

export interface MkTileOpts {
  elevation?: number;
  /** STAIRS only — destination elevation reached at the far side of the
   *  tile (`stairs_z<from>_z<to>` Ed convention). */
  elevationTo?: number;
  direction?: Side;
  /** LIGHT_SOURCE only — emission radius in tiles. Default 4. */
  emissionRadius?: number;
}

const DEFAULT_LIGHT_RADIUS = 4;

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
    case "LIGHT_SWITCH":
      return { kind, solid: true, opaque: true, elevation, ...extras };
    case "CHASM":
      return { kind, solid: true, opaque: false, elevation, ...extras };
    case "CHAIN_LINK_FENCE":
      // Collides but you can see through it (Ed `chain link fence{collide,
      // block_LOS}` — block_LOS is false on this map).
      return { kind, solid: true, opaque: false, elevation, ...extras };
    case "LIGHT_SOURCE":
      return {
        kind,
        solid: false,
        opaque: false,
        elevation,
        emissionRadius: opts.emissionRadius ?? DEFAULT_LIGHT_RADIUS,
        lightOn: true,
        ...extras,
      };
    default:
      return { kind, solid: false, opaque: false, elevation, ...extras };
  }
}
