// VisionCone — directional FOV.
//
// We re-use the 720-ray shadowcast primitive from the original fov.ts, but
// mask each ray to a directional cone aligned with the guard's facing.
// Returns the set of "x,y" tile keys visible to the observer in their room.
//
// Also doubles as the player's omnidirectional FOV (halfAngle = PI) so the
// renderer can dim unseen tiles.

import type { Facing, Tile } from "../types/world.types";

const RAY_COUNT = 360;
export const PLAYER_BASE_RADIUS = 7;
export const PLAYER_DARK_RADIUS = 3;
export const FLASHLIGHT_BONUS = 4;

const FACING_VEC: Record<Facing, { dx: number; dy: number }> = {
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
  south: { dx: 0, dy: 1 },
  north: { dx: 0, dy: -1 },
};

function blocksLight(tile: Tile | undefined): boolean {
  if (!tile) return true;
  return tile.kind === "WALL" || tile.kind === "DOOR_CLOSED";
}

interface ConeArgs {
  tiles: Tile[];
  width: number;
  height: number;
  ox: number;
  oy: number;
  radius: number;
  /** When `facing` is undefined the cone is omnidirectional (player FOV). */
  facing?: Facing;
  /** Half-angle of the cone in radians. Default is full (PI = omnidirectional). */
  halfAngle?: number;
}

export function computeCone(args: ConeArgs): Set<string> {
  const { tiles, width, height, ox, oy, radius, facing, halfAngle = Math.PI } = args;
  const visible = new Set<string>();
  visible.add(`${ox},${oy}`);

  const fv = facing ? FACING_VEC[facing] : null;
  const cosHalf = Math.cos(halfAngle);

  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = (i / RAY_COUNT) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    if (fv) {
      const dot = dx * fv.dx + dy * fv.dy;
      if (dot < cosHalf) continue;
    }

    let x = ox + 0.5;
    let y = oy + 0.5;
    for (let step = 0; step < radius * 2; step++) {
      x += dx * 0.5;
      y += dy * 0.5;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) break;
      if ((tx - ox) ** 2 + (ty - oy) ** 2 > radius * radius) break;
      visible.add(`${tx},${ty}`);
      const tile = tiles[ty * width + tx];
      if (blocksLight(tile)) break;
    }
  }
  return visible;
}

export function getEffectivePlayerRadius(
  ambient: "LIT" | "DIM" | "DARK",
  flashlightOn: boolean,
): number {
  const base =
    ambient === "LIT" ? PLAYER_BASE_RADIUS :
      ambient === "DIM" ? Math.round((PLAYER_BASE_RADIUS + PLAYER_DARK_RADIUS) / 2) :
        PLAYER_DARK_RADIUS;
  return base + (flashlightOn ? FLASHLIGHT_BONUS : 0);
}

/** Half-angle for guard cones. ~70° total cone. */
export const GUARD_CONE_HALF_ANGLE = (70 / 2) * (Math.PI / 180);
export const GUARD_BASE_RANGE = 6;
