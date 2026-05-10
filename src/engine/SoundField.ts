// SoundField — transient sound emitter store with room-graph propagation.
//
// At the start of `WorldEngine.endTurn` the per-tick queue is reset; player
// verbs and world events `emit()` into it during the tick; after the player's
// turn resolves we run `propagate()` to deliver `heardSound` inputs to every
// guard. The AlertFSM consumes the loudest delivery to decide its transition.

import type { Doorway, RoomId, Vec2, WorldState } from "../types/world.types";
import { roomGraph } from "./RoomGraph";
import { eventBus } from "./EventBus";

export const OPEN_DOOR_ATTEN = 2;
export const CLOSED_DOOR_ATTEN = 6;
export const PER_TILE_ATTEN = 0.25;

export interface SoundEmission {
  roomId: RoomId;
  pos: Vec2;
  intensity: number;
  reason: string;
}

export interface DeliveredSound {
  intensity: number;
  src: { roomId: RoomId; pos: Vec2 };
  reason: string;
}

class SoundField {
  private queue: SoundEmission[] = [];

  reset(): void {
    this.queue = [];
  }

  emit(e: SoundEmission): void {
    this.queue.push(e);
    eventBus.emit("SOUND_EMITTED", {
      roomId: e.roomId,
      pos: e.pos,
      intensity: e.intensity,
      reason: e.reason,
    });
  }

  /** Compute every guard's loudest delivered sound this tick. Keyed by guardId. */
  propagate(state: WorldState): Map<string, DeliveredSound> {
    const out = new Map<string, DeliveredSound>();
    if (this.queue.length === 0) return out;

    for (const emission of this.queue) {
      const reach = this.bfsReach(state, emission);
      for (const entity of state.entities.values()) {
        if (entity.kind !== "GUARD" || entity.status !== "ACTIVE") continue;
        const heard = reach.get(entity.roomId);
        if (heard === undefined) continue;
        // Within-room attenuation: distance from the loudest reach into that
        // room to the guard's position. We approximate by using the doorway
        // landing position the BFS recorded.
        const landing = reach.get(`__landing:${entity.roomId}`) as unknown as Vec2 | undefined;
        const refPos = landing ??
          (entity.roomId === emission.roomId ? emission.pos : { x: entity.pos.x, y: entity.pos.y });
        const dist = Math.abs(refPos.x - entity.pos.x) + Math.abs(refPos.y - entity.pos.y);
        const finalIntensity = heard - dist * PER_TILE_ATTEN;
        if (finalIntensity <= 0) continue;
        const previous = out.get(entity.id);
        if (!previous || previous.intensity < finalIntensity) {
          out.set(entity.id, {
            intensity: finalIntensity,
            src: { roomId: emission.roomId, pos: emission.pos },
            reason: emission.reason,
          });
        }
      }
    }
    return out;
  }

  /** BFS the room graph from the emission, accumulating intensity at each
   *  reached room (attenuated by doorway type per traversal). Also records
   *  the landing position used to reach each non-source room (via a side-key
   *  with `__landing:` prefix) so the caller can compute within-room distance. */
  private bfsReach(state: WorldState, e: SoundEmission): Map<string, number> {
    const reach = new Map<string, number>();
    reach.set(e.roomId, e.intensity);
    const queue: Array<{ roomId: RoomId; intensity: number; landing: Vec2 }> = [
      { roomId: e.roomId, intensity: e.intensity, landing: e.pos },
    ];
    const seen = new Set<RoomId>([e.roomId]);
    while (queue.length) {
      const cur = queue.shift()!;
      const neighbors = roomGraph.openNeighbors(state, cur.roomId);
      // Also include closed doorways with strong attenuation.
      const allEdges: Array<{ doorway: Doorway; closed: boolean }> = [];
      const room = state.rooms.get(cur.roomId);
      if (!room) continue;
      for (const d of room.doorways) {
        if (d.from !== cur.roomId) continue;
        const isOpen = neighbors.some((n) => n.doorway === d);
        allEdges.push({ doorway: d, closed: !isOpen });
      }
      for (const edge of allEdges) {
        const next = edge.doorway.to;
        if (seen.has(next)) continue;
        const atten = edge.closed ? CLOSED_DOOR_ATTEN : OPEN_DOOR_ATTEN;
        const nextIntensity = cur.intensity - atten;
        if (nextIntensity <= 0) continue;
        seen.add(next);
        reach.set(next, nextIntensity);
        // Stash the landing position keyed with a sentinel prefix.
        (reach as Map<string, unknown>).set(
          `__landing:${next}`,
          edge.doorway.landingPos,
        );
        queue.push({ roomId: next, intensity: nextIntensity, landing: edge.doorway.landingPos });
      }
    }
    return reach;
  }
}

export const soundField = new SoundField();
