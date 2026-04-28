// 360-ray FOV with light-blocking. Pure function, no state dependencies.
// Adapted from Commonwealth, generalised over our own Tile type.

import type { AmbientLightLevel, Tile } from "../types/world.types";

const RAY_COUNT = 720;
export const MAX_FOV_RADIUS = 11;
export const FLASHLIGHT_BONUS = 5;

const BASE_RADIUS: Record<AmbientLightLevel, number> = {
  LIT: 7,
  DIM: 4,
  DARK: 3,
};

export function getEffectiveFOVRadius(
  ambientLight: AmbientLightLevel,
  flashlightOn: boolean,
  inDarkZone = false,
): number {
  const effective: AmbientLightLevel =
    ambientLight === "LIT" && inDarkZone ? "DARK" : ambientLight;
  return Math.min(
    MAX_FOV_RADIUS,
    BASE_RADIUS[effective] + (flashlightOn ? FLASHLIGHT_BONUS : 0),
  );
}

function blocksLight(tile: Tile | undefined): boolean {
  if (!tile) return true;
  return tile.kind === "WALL" || tile.kind === "DOOR_CLOSED";
}

/** Returns "x,y" keys (no z) of tiles visible from (ox, oy) on the given floor. */
export function calculateFOV(
  tiles: Tile[],
  width: number,
  height: number,
  ox: number,
  oy: number,
  radius: number,
): Set<string> {
  const visible = new Set<string>();
  visible.add(`${ox},${oy}`);

  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = (i / RAY_COUNT) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
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
