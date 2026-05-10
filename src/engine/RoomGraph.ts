// RoomGraph — the room-and-doorway registry.
//
// Rooms live in WorldState.rooms (a Map keyed by RoomId). RoomGraph wraps
// that map with the lookups every other system needs: which doorway sits at
// (roomId, x, y)? what room does it lead to? open or closed?

import type { Doorway, Room, RoomId, Side, Vec2, WorldState } from "../types/world.types";
import { oppositeSide } from "../types/world.types";

export interface CrossingResult {
  toRoom: RoomId;
  /** Where the player lands in the destination room. */
  landingPos: Vec2;
  /** The doorway used. */
  doorway: Doorway;
}

class RoomGraph {
  getRoom(state: WorldState, id: RoomId): Room | undefined {
    return state.rooms.get(id);
  }

  /** Find the doorway whose FROM tile matches (room, x, y). */
  doorwayAt(state: WorldState, roomId: RoomId, x: number, y: number): Doorway | undefined {
    const room = state.rooms.get(roomId);
    if (!room) return undefined;
    for (const d of room.doorways) {
      if (d.from === roomId && d.localPos.x === x && d.localPos.y === y) return d;
    }
    return undefined;
  }

  /** When the player attempts to step from `pos` in direction (dx,dy):
   *  - If that tile is a doorway, return the resulting crossing.
   *  - Otherwise return undefined and the caller treats it as a normal step. */
  attemptCrossing(
    state: WorldState,
    fromRoomId: RoomId,
    pos: Vec2,
    dx: number,
    dy: number,
  ): CrossingResult | undefined {
    const room = state.rooms.get(fromRoomId);
    if (!room) return undefined;
    const target: Vec2 = { x: pos.x + dx, y: pos.y + dy };
    // Crossing 1: target tile is the doorway.
    const here = this.doorwayAt(state, fromRoomId, target.x, target.y);
    if (here && !here.closed) {
      return { toRoom: here.to, landingPos: here.landingPos, doorway: here };
    }
    // Crossing 2: stepping off the room edge into a doorway authored at the
    // edge. We check (target.x, target.y) being out of bounds AND a doorway
    // whose side matches the step direction at the player's edge.
    if (
      target.x < 0 || target.y < 0 ||
      target.x >= room.width || target.y >= room.height
    ) {
      const side: Side =
        target.x < 0 ? "W" :
          target.x >= room.width ? "E" :
            target.y < 0 ? "N" : "S";
      const edgeDoor = room.doorways.find(
        (d) => d.from === fromRoomId && d.side === side &&
          d.localPos.x === pos.x && d.localPos.y === pos.y,
      );
      if (edgeDoor && !edgeDoor.closed) {
        return { toRoom: edgeDoor.to, landingPos: edgeDoor.landingPos, doorway: edgeDoor };
      }
    }
    return undefined;
  }

  /** Iterate every neighbor room reachable through an OPEN doorway. */
  openNeighbors(state: WorldState, roomId: RoomId): Array<{ roomId: RoomId; doorway: Doorway }> {
    const room = state.rooms.get(roomId);
    if (!room) return [];
    return room.doorways
      .filter((d) => !d.closed)
      .map((d) => ({ roomId: d.to, doorway: d }));
  }

  /** Toggle the closed state of a doorway by its FROM-side tile. Mirrors the
   *  closure to the matching doorway in the destination room so both sides
   *  agree on the door's state. */
  toggleDoorway(state: WorldState, roomId: RoomId, pos: Vec2): boolean {
    const d = this.doorwayAt(state, roomId, pos.x, pos.y);
    if (!d) return false;
    d.closed = !d.closed;
    // Mirror — the destination room has a doorway pointing back here.
    const dst = state.rooms.get(d.to);
    if (dst) {
      const back = dst.doorways.find(
        (b) => b.from === d.to && b.to === roomId &&
          b.side === oppositeSide(d.side),
      );
      if (back) back.closed = d.closed;
    }
    return true;
  }
}

export const roomGraph = new RoomGraph();
