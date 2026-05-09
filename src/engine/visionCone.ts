// Vision-cone helper. Replaces the omnidirectional SIGHT_RADIUS check the
// EnforcerAI used to do; also drives surveillance cameras. Pure functions —
// stateless, no event emission.

import type {
  AlertLevel,
  AmbientLightLevel,
  Facing,
  Tile,
  Vec3,
  WorldState,
} from "../types/world.types";

const FACING_DELTA: Record<Facing, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

/** Same straight-line raycast EnforcerAI used inline. Lifted here so cameras
 *  can reuse it. Walls and closed doors block. */
export function hasLineOfSight(
  state: WorldState,
  from: Vec3,
  to: Vec3,
): boolean {
  if (from.z !== to.z) return false;
  const floor = state.floors.get(from.z);
  if (!floor) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return true;
  for (let i = 1; i < steps; i++) {
    const x = Math.round(from.x + (dx * i) / steps);
    const y = Math.round(from.y + (dy * i) / steps);
    if (x < 0 || y < 0 || x >= floor.width || y >= floor.height) return false;
    const tile: Tile | undefined = floor.tiles[y * floor.width + x];
    if (tile && tile.opaque) return false;
  }
  return true;
}

/** True if `to` lies inside a directional cone originating at `from`,
 *  pointing along `facing`, with the given range and half-angle (degrees). */
export function isInVisionCone(
  from: Vec3,
  facing: Facing,
  to: Vec3,
  range: number,
  halfAngleDeg = 45,
): boolean {
  if (from.z !== to.z) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Same tile counts as inside the cone.
  if (dx === 0 && dy === 0) return true;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  const f = FACING_DELTA[facing];
  // dot(facing, normalised(delta)) must be >= cos(halfAngle).
  const dot = (dx * f.dx + dy * f.dy) / dist;
  const threshold = Math.cos((halfAngleDeg * Math.PI) / 180);
  return dot >= threshold;
}

/** Cone range varies with the enforcer's current alert level and the local
 *  ambient light. Mirrors getEffectiveFOVRadius's "DARK halves things" feel. */
export function coneRangeFor(
  level: AlertLevel,
  ambient: AmbientLightLevel,
): number {
  const base = level === "ALERT" ? 7
    : level === "EVASION" ? 6
    : level === "CAUTION" ? 6
    : 5; // NORMAL
  if (ambient === "DARK") return Math.max(2, Math.floor(base / 2));
  if (ambient === "DIM") return Math.max(3, base - 1);
  return base;
}
