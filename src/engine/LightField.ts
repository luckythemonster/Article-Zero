// LightField — per-room lit-tile computation.
//
// Each LIGHT_SOURCE tile that's `lightOn !== false` emits over its
// `emissionRadius` (default 4) using the shadowcast primitive from
// VisionCone. The union of all emissions is the room's lit set. Cached on
// Room.litTiles; invalidated by setting it to undefined when any toggle
// fires.
//
// Convention: a room with NO LIGHT_SOURCE tiles is fully lit (back-compat
// with all existing maps). A room with light tiles is dark outside the
// emissions, regardless of room.ambientLight. ambientLight still controls
// the player/enforcer cone *radius*; LightField controls which of the tiles
// inside that radius actually register as visible.

import type { Room } from "../types/world.types";
import { computeCone } from "./VisionCone";

const DEFAULT_RADIUS = 4;

function fullyLit(room: Room): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      out.add(`${x},${y}`);
    }
  }
  return out;
}

function compute(room: Room): Set<string> {
  // Opt-in: rooms only use per-tile light gating when they declare some
  // light infrastructure — either painted switches or virtual cross-room
  // bleed emissions. Existing maps without any of those stay fully lit and
  // their LIGHT_SOURCE tiles render as decorative glyphs as before.
  if (!room.lightSwitches && !room.bleedLights) return fullyLit(room);
  const lit = new Set<string>();
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const t = room.tiles[y * room.width + x];
      if (t.kind !== "LIGHT_SOURCE") continue;
      if (t.lightOn === false) continue;
      const r = t.emissionRadius ?? DEFAULT_RADIUS;
      const fromHere = computeCone({
        tiles: room.tiles,
        width: room.width,
        height: room.height,
        ox: x,
        oy: y,
        radius: r,
      });
      for (const k of fromHere) lit.add(k);
    }
  }
  if (room.bleedLights) {
    for (const b of room.bleedLights) {
      const fromHere = computeCone({
        tiles: room.tiles,
        width: room.width,
        height: room.height,
        ox: b.pos.x,
        oy: b.pos.y,
        radius: b.radius,
      });
      for (const k of fromHere) lit.add(k);
    }
  }
  return lit;
}

class LightField {
  getOrCompute(room: Room): Set<string> {
    if (!room.litTiles) room.litTiles = compute(room);
    return room.litTiles;
  }

  invalidate(room: Room): void {
    room.litTiles = undefined;
  }
}

export const lightField = new LightField();
