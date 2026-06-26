import type { Entity, EntityKind, Facing, Room, Tile, Vec2, WorldState } from "../../types/world.types";
import { facingFromDelta } from "../../types/world.types";
import { eventBus } from "../EventBus";
import { roomGraph } from "../RoomGraph";
import { soundField } from "../SoundField";
import { enforcerSystem } from "../EnforcerSystem";
import { lightField } from "../LightField";
import { VENT_AP_COST } from "./constants";

export function tileAt(state: WorldState, roomId: string, p: Vec2): Tile | undefined {
  const room = state.rooms.get(roomId);
  if (!room) return undefined;
  if (p.x < 0 || p.y < 0 || p.x >= room.width || p.y >= room.height) return undefined;
  return room.tiles[p.y * room.width + p.x];
}

export function entityAt(state: WorldState, roomId: string, p: Vec2) {
  for (const entity of state.entities.values()) {
    if (entity.status !== "ACTIVE") continue;
    if (entity.roomId !== roomId) continue;
    if (entity.pos.x === p.x && entity.pos.y === p.y) return entity;
  }
  return undefined;
}

export function anchorBlocked(state: WorldState, roomId: string, p: Vec2): boolean {
  const key = `${p.x},${p.y}`;
  for (const entity of state.entities.values()) {
    if (entity.kind !== "CDN_7" || entity.status !== "ACTIVE") continue;
    if (entity.roomId !== roomId) continue;
    if ((entity.alert?.anchorTurnsRemaining ?? 0) <= 0) continue;
    if (entity.alert?.anchorTiles?.has(key)) return true;
  }
  return false;
}

export function applyLightToggle(
  state: WorldState,
  room: Room,
  targets: Vec2[],
  originPos: Vec2,
): boolean | null {
  if (targets.length === 0) return null;
  const valid = targets.filter((p) => {
    const t = room.tiles[p.y * room.width + p.x];
    return t && t.kind === "LIGHT_SOURCE";
  });
  if (valid.length === 0) return null;
  const anyOn = valid.some((p) => {
    const t = room.tiles[p.y * room.width + p.x];
    return t.lightOn !== false;
  });
  const next = !anyOn;
  for (const p of valid) {
    const t = room.tiles[p.y * room.width + p.x];
    t.lightOn = next;
  }
  lightField.invalidate(room);
  eventBus.emit("LIGHT_TOGGLED", {
    roomId: room.id,
    switchPos: originPos,
    lightPositions: valid,
    on: next,
  });
  if (!next) {
    enforcerSystem.reactToLightToggleOff(state, room, valid);
  }
  return next;
}

export function resolveSwitchTargets(room: Room, controls: Vec2[]): Vec2[] {
  if (controls.length > 0) return controls;
  const out: Vec2[] = [];
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const t = room.tiles[y * room.width + x];
      if (t.kind === "LIGHT_SOURCE") out.push({ x, y });
    }
  }
  return out;
}

export function toggleDoorTileAt(room: Room, pos: Vec2, open?: boolean, DOOR_INTENSITY: number = 2): boolean | null {
  const tile = room.tiles[pos.y * room.width + pos.x];
  if (!tile || (tile.kind !== "DOOR_CLOSED" && tile.kind !== "DOOR_OPEN")) return null;
  const nextOpen = open ?? (tile.kind === "DOOR_CLOSED");
  tile.kind = nextOpen ? "DOOR_OPEN" : "DOOR_CLOSED";
  tile.solid = !nextOpen;
  tile.opaque = !nextOpen;
  eventBus.emit("DOOR_TOGGLED", { roomId: room.id, pos, open: nextOpen });
  soundField.emit({ roomId: room.id, pos, intensity: DOOR_INTENSITY, reason: "door" });
  return nextOpen;
}

export function findItemAt(state: WorldState, roomId: string, p: Vec2) {
  return state.itemsByPos.get(`${roomId}:${p.x},${p.y}`);
}

export function findEntityInFacingCone(
  state: WorldState,
  origin: Vec2,
  facing: Facing,
  roomId: string,
  radius: number,
  kind: EntityKind,
): Entity | undefined {
  const fx = facing === "east" ? 1 : facing === "west" ? -1 : 0;
  const fy = facing === "south" ? 1 : facing === "north" ? -1 : 0;
  const cosHalf = Math.cos(Math.PI / 3);
  let best: Entity | undefined;
  let bestDist = Infinity;
  for (const entity of state.entities.values()) {
    if (entity.kind !== kind || entity.status !== "ACTIVE") continue;
    if (entity.roomId !== roomId) continue;
    const dx = entity.pos.x - origin.x;
    const dy = entity.pos.y - origin.y;
    const distSq = dx * dx + dy * dy;
    if (distSq === 0 || distSq > radius * radius) continue;
    const dist = Math.sqrt(distSq);
    const dot = (dx * fx + dy * fy) / dist;
    if (dot < cosHalf) continue;
    if (dist < bestDist) {
      best = entity;
      bestDist = dist;
    }
  }
  return best;
}

export function moveCommon(
  state: WorldState,
  dx: number,
  dy: number,
  apCost: number,
  intensity: number,
  reason: string,
): boolean {
  if (state.detained || state.player.ap < apCost) return false;
  if (state.player.hidingTileKey) return false;
  const effIntensity = intensity;
  if (state.player.peeking) {
    state.player.peeking = undefined;
    eventBus.emit("PLAYER_PEEKED", { facing: null });
  }
  const facing = facingFromDelta(dx, dy);
  if (facing && facing !== state.player.facing) {
    state.player.facing = facing;
    eventBus.emit("PLAYER_FACING_CHANGED", { facing });
  }
  const fromRoomId = state.player.roomId;
  const fromPos = state.player.pos;

  const crossing = roomGraph.attemptCrossing(state, fromRoomId, fromPos, dx, dy);
  if (crossing && crossing.doorway.kind !== "ladder") {
    const ventDoor = crossing.doorway.kind === "vent";
    if (ventDoor) {
      if (state.player.stance !== "SNEAK") return false;
      if (state.player.ap < VENT_AP_COST) return false;
    }
    const cost = ventDoor ? VENT_AP_COST : apCost;
    eventBus.emit("ROOM_EXITED", { roomId: fromRoomId });
    state.player.roomId = crossing.toRoom;
    if (state.lockdown && state.lockdown.roomId !== crossing.toRoom) {
      const clearedRoom = state.lockdown.roomId;
      state.lockdown = undefined;
      eventBus.emit("LOCKDOWN_CLEARED", { roomId: clearedRoom, reason: "crossed" });
    }
    state.player.pos = { ...crossing.landingPos };
    const previousAp = state.player.ap;
    state.player.ap -= cost;
    state.player.lastMoveTurn = state.turn;
    eventBus.emit("PLAYER_AP_CHANGED", {
      previous: previousAp,
      current: state.player.ap,
    });
    eventBus.emit("PLAYER_MOVED", {
      from: fromPos,
      to: state.player.pos,
      roomId: state.player.roomId,
    });
    eventBus.emit("ROOM_ENTERED", {
      roomId: state.player.roomId,
      from: fromRoomId,
    });
    if (!ventDoor && effIntensity > 0) {
      soundField.emit({
        roomId: state.player.roomId,
        pos: state.player.pos,
        intensity: effIntensity,
        reason,
      });
    }
    return true;
  }

  // Otherwise attempt an in-room step.
  // Otherwise attempt an in-room step.
  const to: Vec2 = { x: fromPos.x + dx, y: fromPos.y + dy };
  const tile = tileAt(state, fromRoomId, to);
  if (!tile || tile.solid) return false;
  if (entityAt(state, fromRoomId, to)) return false;
  if (anchorBlocked(state, fromRoomId, to)) return false;
  state.player.pos = to;
  state.player.ap -= apCost;
  state.player.lastMoveTurn = state.turn;
  eventBus.emit("PLAYER_MOVED", { from: fromPos, to, roomId: fromRoomId });
  eventBus.emit("PLAYER_AP_CHANGED", {
    previous: state.player.ap + apCost,
    current: state.player.ap,
  });
  if (effIntensity > 0) {
    soundField.emit({ roomId: fromRoomId, pos: to, intensity: effIntensity, reason });
  }
  return true;
}

export function reopenSealedDoorways(state: WorldState, roomId: string): void {
  const room = state.rooms.get(roomId);
  if (!room) return;
  for (const d of room.doorways) {
    if (!d.closed) continue;
    const isVent = d.kind === "vent";
    roomGraph.toggleDoorway(state, roomId, d.localPos);
    const tile = room.tiles[d.localPos.y * room.width + d.localPos.x];
    if (tile && !isVent && (tile.kind === "DOOR_CLOSED" || tile.kind === "DOOR_OPEN")) {
      tile.kind = "DOOR_OPEN";
      tile.solid = false;
      tile.opaque = false;
    }
    const dst = state.rooms.get(d.to);
    if (dst) {
      const back = dst.doorways.find((b) => b.from === d.to && b.to === roomId);
      if (back) {
        const bt = dst.tiles[back.localPos.y * dst.width + back.localPos.x];
        if (bt && !isVent && (bt.kind === "DOOR_CLOSED" || bt.kind === "DOOR_OPEN")) {
          bt.kind = "DOOR_OPEN";
          bt.solid = false;
          bt.opaque = false;
        }
      }
    }
    eventBus.emit("DOOR_TOGGLED", { roomId, pos: d.localPos, open: true });
  }
}
