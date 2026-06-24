// Player action implementations. Mutates WorldState in place, then emits via
// the EventBus. One function per verb. Sound emission is centralised here so
// AlertFSM consumers see a consistent picture of "what the player did".

import type { Entity, EntityKind, Facing, HvacMode, ItemInstance, ItemType, Room, RoomId, Tile, Vec2, WorldState } from "../types/world.types";
import { facingFromDelta, roomTileKey } from "../types/world.types";
import { eventBus } from "./EventBus";
import { roomGraph } from "./RoomGraph";
import { soundField } from "./SoundField";
import { alignmentSession } from "./AlignmentSession";
import { alertFSM } from "./AlertFSM";
import { enforcerSystem } from "./EnforcerSystem";
import { atmosphericsField } from "./AtmosphericsField";
import { documentArchive } from "./DocumentArchive";
import { lightField } from "./LightField";
import { useTerminalStore } from "../state/useTerminalStore";

const MOVE_AP_COST = 1;
const SNEAK_AP_COST = 1;
const RUN_AP_COST = 1;
const KNOCK_AP_COST = 1;
const INTERACT_AP_COST = 1;
const VENT_AP_COST = 2;
const LADDER_AP_COST = 1;
const KILL_SCREEN_AP_COST = 1;
const PRY_LOCKDOWN_AP_COST = 2;
export const ALIGN_AP_COST = 3;

const WALK_INTENSITY = 1;
const SNEAK_INTENSITY = 0;
// Sits between WALK (1, CAUTION threshold) and KNOCK (4, ALERT threshold) so a
// run pulls patrols to CAUTION on the first heard step but doesn't immediately
// scream "intruder". See AlertFSM thresholds.
const RUN_INTENSITY = 2;
const KNOCK_INTENSITY = 4;
const DOOR_INTENSITY = 2;
const LOCKER_INTENSITY = 2;
const LADDER_INTENSITY = 1;
const PRY_LOCKDOWN_INTENSITY = 6;

function tileAt(state: WorldState, roomId: string, p: Vec2): Tile | undefined {
  const room = state.rooms.get(roomId);
  if (!room) return undefined;
  if (p.x < 0 || p.y < 0 || p.x >= room.width || p.y >= room.height) return undefined;
  return room.tiles[p.y * room.width + p.x];
}

function entityAt(state: WorldState, roomId: string, p: Vec2) {
  for (const entity of state.entities.values()) {
    if (entity.status !== "ACTIVE") continue;
    if (entity.roomId !== roomId) continue;
    if (entity.pos.x === p.x && entity.pos.y === p.y) return entity;
  }
  return undefined;
}

/** True when an ACTIVE CDN-7 is holding an anchor across `p` in `roomId`.
 *  Gated on `status === "ACTIVE"` so an EMP'd / oxygen-incapacitated CDN-7
 *  releases the corridor instantly (the timer/event clean-up runs later in
 *  advanceTurn, but the barrier itself lifts on the same frame as the takedown). */
function anchorBlocked(state: WorldState, roomId: string, p: Vec2): boolean {
  const key = `${p.x},${p.y}`;
  for (const entity of state.entities.values()) {
    if (entity.kind !== "CDN_7" || entity.status !== "ACTIVE") continue;
    if (entity.roomId !== roomId) continue;
    if ((entity.alert?.anchorTurnsRemaining ?? 0) <= 0) continue;
    if (entity.alert?.anchorTiles?.has(key)) return true;
  }
  return false;
}

/** Flip the on/off state of a set of LIGHT_SOURCE tiles. Coupled toggle: if
 *  any is on, all go off; if all are off, all go on. Emits LIGHT_TOGGLED and
 *  invalidates the room's lit cache. When darkening, asks EnforcerSystem to
 *  react — but only enforcers that witness the toggle (the light is in their
 *  vision cone) or remember the light being on while still in the room respond.
 *  No SoundField click is emitted, so the toggle never alerts enforcers
 *  elsewhere. Returns the new on/off state, or null if no valid targets. */
function applyLightToggle(
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
  // Perception-gated reaction for the darkening case — enforcers respond right
  // away (not at end-of-turn) but only if they witness the toggle or remember
  // the light being on in this room. Re-lighting is silent toward enforcers
  // (asymmetric by design — turning lights back on shouldn't un-CAUTION an
  // already-suspicious enforcer).
  if (!next) {
    enforcerSystem.reactToLightToggleOff(state, room, valid);
  }
  return next;
}

/** Resolve the LIGHT_SOURCE positions a switch controls — explicit
 *  `controls` if set, otherwise every LIGHT_SOURCE in the room. */
function resolveSwitchTargets(room: Room, controls: Vec2[]): Vec2[] {
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

/** Flip a tile-based door at `pos` (or force it to `open` when given). Keeps
 *  kind/solid/opaque in sync, emits DOOR_TOGGLED + a door sound. Returns the
 *  resulting open-state, or null if there's no door tile there. */
function toggleDoorTileAt(room: Room, pos: Vec2, open?: boolean): boolean | null {
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

function findItemAt(state: WorldState, roomId: string, p: Vec2): ItemInstance | undefined {
  return state.itemsByPos.get(`${roomId}:${p.x},${p.y}`);
}

function findEntityInFacingCone(
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

function moveCommon(
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
  // Any movement breaks an active peek.
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

  // Try a doorway crossing first. Ladder doorways are excluded — stepping
  // onto a ladder cell should NOT teleport the player; the climb requires a
  // deliberate E-press handled in actions.interact below. The LADDER tile is
  // non-solid (tile-factory default), so this fall-through walks the player
  // onto the ladder via the standard in-room step path.
  const crossing = roomGraph.attemptCrossing(state, fromRoomId, fromPos, dx, dy);
  if (crossing && crossing.doorway.kind !== "ladder") {
    // Vent-flavoured doorway: must be in SNEAK stance, pays VENT_AP_COST,
    // and crosses silently. The destination room is the crawlspace (or, for
    // the second hop, the floor on the other side). Standard ROOM_ENTER
    // /EXIT events fire so the renderer fades and swaps as for any room.
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

// ── Tactical-item handlers ────────────────────────────────────────────────
// One helper per ItemType (the five new entries — EXTRACTION_CUBE and
// BYPASS_DRIVE remain passive). Each returns true on a successful deployment;
// `actions.useItem` consumes the inventory slot and charges AP only if so.

const PHANTOM_EMITTER_INTENSITY = 2;
const PHANTOM_EMITTER_TURNS = 3;
const SPOOF_TURNS = 4;
const BAFFLE_TURNS = 3;
const BAFFLE_RADIUS = 5;
const DUMP_FRAGMENT_RADIUS = 5;
const DUMP_FRAGMENT_STUN_TURNS = 1;
const EMP_RADIUS = 5;
const EMP_DISABLE_TURNS = 4;
const EMP_GRENADE_RADIUS = 3;
const EMP_GRENADE_MAX_THROW = 6;
const Q_MINE_RADIUS = 3;

let emitterCounter = 0;
let mineCounter = 0;

function useEmitter(state: WorldState, _item: ItemInstance): boolean {
  // Deploy on the tile in front of the player; if that tile is blocked or
  // out-of-bounds, fall back to the player's own tile.
  const f = state.player.facing;
  const fx = f === "east" ? 1 : f === "west" ? -1 : 0;
  const fy = f === "south" ? 1 : f === "north" ? -1 : 0;
  let pos: Vec2 = {
    x: state.player.pos.x + fx,
    y: state.player.pos.y + fy,
  };
  const front = tileAt(state, state.player.roomId, pos);
  if (!front || front.solid) {
    pos = { ...state.player.pos };
  }
  emitterCounter += 1;
  const emitterId = `phantom-${state.turn}-${emitterCounter}`;
  state.activeEmitters.push({
    id: emitterId,
    roomId: state.player.roomId,
    pos,
    intensity: PHANTOM_EMITTER_INTENSITY,
    turnsRemaining: PHANTOM_EMITTER_TURNS,
    reason: "phantom-manifest",
  });
  eventBus.emit("ITEM_DEPLOYED", {
    itemType: "PHANTOM_EMITTER",
    roomId: state.player.roomId,
    pos,
    turnsRemaining: PHANTOM_EMITTER_TURNS,
  });
  return true;
}

function useQMine(state: WorldState, _item: ItemInstance): boolean {
  // Place on the tile in front of the player; if that tile is blocked or
  // out-of-bounds, fall back to the player's own tile (mirrors useEmitter).
  const f = state.player.facing;
  const fx = f === "east" ? 1 : f === "west" ? -1 : 0;
  const fy = f === "south" ? 1 : f === "north" ? -1 : 0;
  let pos: Vec2 = {
    x: state.player.pos.x + fx,
    y: state.player.pos.y + fy,
  };
  const front = tileAt(state, state.player.roomId, pos);
  if (!front || front.solid) {
    pos = { ...state.player.pos };
  }
  mineCounter += 1;
  state.activeMines.push({
    id: `qmine-${state.turn}-${mineCounter}`,
    roomId: state.player.roomId,
    pos,
    radius: Q_MINE_RADIUS,
  });
  eventBus.emit("ITEM_DEPLOYED", {
    itemType: "Q_MINE",
    roomId: state.player.roomId,
    pos,
    turnsRemaining: 0,
  });
  return true;
}

function useSpoofBadge(state: WorldState): boolean {
  state.player.spoofTurnsRemaining = SPOOF_TURNS;
  eventBus.emit("ITEM_EFFECT_STARTED", {
    effect: "spoof",
    turnsRemaining: SPOOF_TURNS,
  });
  return true;
}

function detonateBaffle(state: WorldState, center: Vec2, radius: number, roomId: RoomId): Entity[] {
  const r2 = radius * radius;
  const targets: Entity[] = [];
  for (const entity of state.entities.values()) {
    if (entity.status !== "ACTIVE") continue;
    if (entity.kind !== "SILICATE" && entity.kind !== "CDN_7") continue;
    if (entity.roomId !== roomId) continue;
    const dx = entity.pos.x - center.x;
    const dy = entity.pos.y - center.y;
    if (dx * dx + dy * dy > r2) continue;
    targets.push(entity);
  }

  for (const target of targets) {
    target.blindnessTurnsRemaining = BAFFLE_TURNS;
  }
  return targets;
}

function useBaffle(state: WorldState): boolean {
  detonateBaffle(state, state.player.pos, BAFFLE_RADIUS, state.player.roomId);
  eventBus.emit("ITEM_DETONATED", {
    itemType: "THERMAL_BAFFLE",
    roomId: state.player.roomId,
    pos: { ...state.player.pos },
    radius: BAFFLE_RADIUS,
  });
  return true;
}

function throwDumpFragment(state: WorldState, _item: ItemInstance): boolean {
  const target = findEntityInFacingCone(
    state,
    state.player.pos,
    state.player.facing,
    state.player.roomId,
    DUMP_FRAGMENT_RADIUS,
    "ENFORCER",
  );
  if (!target) {
    eventBus.emit("ITEM_REJECTED", {
      itemType: "DUMP_FRAGMENT",
      reason: "no-target",
    });
    return false;
  }
  const alert = alertFSM.ensure(state, target);
  const previousLevel = alert.level;
  if (alert.level === "ALERT") {
    alert.level = "EVASION";
    alert.enteredTurn = state.turn;
    alert.lastSeenTurn = undefined;
    // Wipe the last-known target so the now-searching enforcer doesn't beeline
    // to the player's last spot and re-acquire — the fragment is meant to break
    // pursuit, leaving it scanning in place.
    alert.lastStimulus = undefined;
    alert.lastStimulusRoom = undefined;
    eventBus.emit("ENFORCER_ALERT_CHANGED", {
      enforcerId: target.id,
      from: previousLevel,
      to: "EVASION",
    });
  } else {
    alert.stunTurnsRemaining = DUMP_FRAGMENT_STUN_TURNS;
  }
  // Small localised burst at the enforcer's tile so neighbours don't all snap
  // around at once — matches the lore of a self-contained paradox event.
  soundField.emit({
    roomId: target.roomId,
    pos: target.pos,
    intensity: 1,
    reason: "dump-fragment",
  });
  eventBus.emit("ITEM_THROWN", {
    itemType: "DUMP_FRAGMENT",
    targetEntityId: target.id,
  });
  return true;
}

/** Shared EMP detonation: temporarily disables all silicate-kind entities within
 *  `radius` of `center` in `roomId`. Sets disabledTurnsRemaining and forces
 *  status to DORMANT; advanceTurn() restores them to ACTIVE when the timer hits 0.
 *  Returns true if at least one entity was hit (caller may reject if zero). */
function detonateEmp(state: WorldState, center: Vec2, radius: number, roomId: RoomId): Entity[] {
  const r2 = radius * radius;
  const targets: Entity[] = [];
  for (const entity of state.entities.values()) {
    if (entity.status !== "ACTIVE") continue;
    if (
      entity.kind !== "SURVEILLANCE_DRONE" &&
      entity.kind !== "SECURITY_CAMERA" &&
      entity.kind !== "ENFORCER" &&
      entity.kind !== "SILICATE" &&
      entity.kind !== "CDN_7"
    ) continue;
    if (entity.roomId !== roomId) continue;
    const dx = entity.pos.x - center.x;
    const dy = entity.pos.y - center.y;
    if (dx * dx + dy * dy > r2) continue;
    targets.push(entity);
  }
  // Single burst at the center — neighbours hear one pulse, not one per unit.
  soundField.emit({ roomId, pos: center, intensity: 1, reason: "emp" });
  for (const target of targets) {
    const previous = target.status;
    target.disabledTurnsRemaining = EMP_DISABLE_TURNS;
    target.status = "DORMANT";
    eventBus.emit("ENTITY_STATUS_CHANGED", {
      entityId: target.id,
      previous,
      current: "DORMANT",
    });
  }
  return targets;
}

/** Detonate an EMP burst centered on the player (radius EMP_RADIUS, current room
 *  only). Omnidirectional — facing doesn't matter. Does NOT clear lockdowns. */
function useEmp(state: WorldState, _item: ItemInstance): boolean {
  const targets = detonateEmp(state, state.player.pos, EMP_RADIUS, state.player.roomId);
  if (targets.length === 0) {
    eventBus.emit("ITEM_REJECTED", { itemType: "EMP", reason: "no-target" });
    return false;
  }
  eventBus.emit("ITEM_DETONATED", {
    itemType: "EMP",
    roomId: state.player.roomId,
    pos: { ...state.player.pos },
    radius: EMP_RADIUS,
  });
  return true;
}

/** Inverse of EnforcerSystem.triggerLockdown: reopen every doorway sealed in
 *  `roomId` (toggleDoorway flips both sides of each pair). Solid blast doors
 *  repaint to DOOR_OPEN; VENT tiles stay VENT (only the `closed` flag clears). */
function reopenSealedDoorways(state: WorldState, roomId: string): void {
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

function useOverrideKey(state: WorldState): boolean {
  const f = state.player.facing;
  const fx = f === "east" ? 1 : f === "west" ? -1 : 0;
  const fy = f === "south" ? 1 : f === "north" ? -1 : 0;
  const target: Vec2 = {
    x: state.player.pos.x + fx,
    y: state.player.pos.y + fy,
  };
  const door = roomGraph.doorwayAt(state, state.player.roomId, target.x, target.y);
  if (!door) {
    eventBus.emit("ITEM_REJECTED", {
      itemType: "OVERRIDE_KEY",
      reason: "no-door",
    });
    return false;
  }
  const wasClosed = !!door.closed;
  roomGraph.toggleDoorway(state, state.player.roomId, target);
  // Mirror the tile flags on both sides — same shape as the
  // terminal-unlocks branch in `interact`.
  const tile = tileAt(state, state.player.roomId, target);
  if (tile) {
    if (wasClosed) {
      tile.kind = "DOOR_OPEN";
      tile.solid = false;
      tile.opaque = false;
    } else {
      tile.kind = "DOOR_CLOSED";
      tile.solid = true;
      tile.opaque = true;
    }
  }
  const mirror = state.rooms.get(door.to);
  if (mirror) {
    const back = mirror.doorways.find(
      (b) => b.from === door.to && b.to === state.player.roomId,
    );
    if (back) {
      const bt = mirror.tiles[back.localPos.y * mirror.width + back.localPos.x];
      if (bt) {
        if (wasClosed) {
          bt.kind = "DOOR_OPEN";
          bt.solid = false;
          bt.opaque = false;
        } else {
          bt.kind = "DOOR_CLOSED";
          bt.solid = true;
          bt.opaque = true;
        }
      }
    }
  }
  // No SoundField.emit — the override is doctrinally invisible. That silence
  // is the point. DOOR_TOGGLED still fires so the renderer redraws.
  eventBus.emit("DOOR_TOGGLED", {
    roomId: state.player.roomId,
    pos: target,
    open: wasClosed,
  });
  return true;
}

export const actions = {
  move(state: WorldState, dx: number, dy: number): boolean {
    return moveCommon(state, dx, dy, MOVE_AP_COST, WALK_INTENSITY, "walk");
  },
  sneak(state: WorldState, dx: number, dy: number): boolean {
    return moveCommon(state, dx, dy, SNEAK_AP_COST, SNEAK_INTENSITY, "sneak");
  },
  run(state: WorldState, dx: number, dy: number): boolean {
    return moveCommon(state, dx, dy, RUN_AP_COST, RUN_INTENSITY, "run");
  },

  /** Rap on the wall the player is facing. Loud noise, lures enforcers. */
  knock(state: WorldState): boolean {
    if (state.detained || state.player.ap < KNOCK_AP_COST) return false;
    if (state.player.hidingTileKey) return false;
    const f = state.player.facing;
    const dx = f === "east" ? 1 : f === "west" ? -1 : 0;
    const dy = f === "south" ? 1 : f === "north" ? -1 : 0;
    const target: Vec2 = { x: state.player.pos.x + dx, y: state.player.pos.y + dy };
    const tile = tileAt(state, state.player.roomId, target);
    if (!tile || tile.kind !== "WALL") return false;
    state.player.ap -= KNOCK_AP_COST;
    eventBus.emit("PLAYER_AP_CHANGED", {
      previous: state.player.ap + KNOCK_AP_COST,
      current: state.player.ap,
    });
    soundField.emit({
      roomId: state.player.roomId,
      pos: target,
      intensity: KNOCK_INTENSITY,
      reason: "knock",
    });
    return true;
  },

  toggleStance(state: WorldState): void {
    if (state.player.hidingTileKey) return;
    state.player.stance =
      state.player.stance === "WALK"
        ? "SNEAK"
        : state.player.stance === "SNEAK"
          ? "RUN"
          : "WALK";
    eventBus.emit("PLAYER_STANCE_CHANGED", { stance: state.player.stance });
  },

  /** Lean to extend FOV in `dir` (defaults to current facing) without moving.
   *  Costs 0 AP. Cleared by movement and end-of-turn. Refused while hidden. */
  peek(state: WorldState, dir?: Facing): boolean {
    if (state.detained) return false;
    if (state.player.hidingTileKey) return false;
    const facing = dir ?? state.player.facing;
    state.player.peeking = facing;
    if (state.player.facing !== facing) {
      state.player.facing = facing;
      eventBus.emit("PLAYER_FACING_CHANGED", { facing });
    }
    eventBus.emit("PLAYER_PEEKED", { facing });
    return true;
  },

  /** Called by WorldEngine.advanceTurn at TURN_END to clear ephemeral state. */
  clearPeek(state: WorldState): void {
    if (!state.player.peeking) return;
    state.player.peeking = undefined;
    eventBus.emit("PLAYER_PEEKED", { facing: null });
  },

  /** Re-orient to face `facing` without moving. Costs 0 AP. Refused while
   *  detained or hidden. A deliberate re-orient cancels an active peek. */
  turn(state: WorldState, facing: Facing): boolean {
    if (state.detained) return false;
    if (state.player.hidingTileKey) return false;
    if (state.player.facing === facing && !state.player.peeking) return false;
    if (state.player.peeking) {
      state.player.peeking = undefined;
      eventBus.emit("PLAYER_PEEKED", { facing: null });
    }
    if (state.player.facing !== facing) {
      state.player.facing = facing;
      eventBus.emit("PLAYER_FACING_CHANGED", { facing });
    }
    return true;
  },


  getAvailableInteractAction(state: WorldState): string | null {
    if (state.detained) return null;
    const { player } = state;
    const room = state.rooms.get(player.roomId);
    if (!room) return null;

    for (const entity of state.entities.values()) {
      if (entity.roomId !== player.roomId) continue;
      const dx = Math.abs(entity.pos.x - player.pos.x);
      const dy = Math.abs(entity.pos.y - player.pos.y);
      if (dx + dy === 1 || dx + dy === 0) {
        if (entity.kind === "SILICATE" && entity.status === "ACTIVE") return "silicate";
      }
    }

    const targetPos = { ...player.pos };
    if (player.facing === "north") targetPos.y -= 1;
    else if (player.facing === "south") targetPos.y += 1;
    else if (player.facing === "east") targetPos.x += 1;
    else if (player.facing === "west") targetPos.x -= 1;

    const t = room.tiles[targetPos.y * room.width + targetPos.x];
    if (t) {
      if (t.kind === "TERMINAL") return "terminal";
      if (t.kind === "DOOR_CLOSED" || t.kind === "DOOR_OPEN") return "door";
      if (t.kind === "LOCKER") return "locker";
      if (t.kind === "ITEM_CHEST") {
        const chest = state.chestPayloads.get(roomTileKey(state.player.roomId, targetPos));
        if (chest && !chest.opened) return "loot";
      }
    }

    // Check standing tile
    const st = room.tiles[player.pos.y * room.width + player.pos.x];
    if (st) {
      if (st.kind === "LOCKER") return "locker";
      if (st.kind === "VENT") return "vent";
      if (st.kind === "LADDER") {
        const door = roomGraph.doorwayAt(state, state.player.roomId, player.pos.x, player.pos.y);
        if (door && door.kind === "ladder" && !door.closed) return "ladder";
      }
      if (st.kind === "EXFIL_POINT") {
        const carryingCube = state.player.inventory.some((i) => i.itemType === "EXTRACTION_CUBE");
        if (carryingCube) return "exfil";
      }
    }
    const itemHere = findItemAt(state, state.player.roomId, player.pos);
    if (itemHere) return "item";

    return null;
  },

  interact(state: WorldState): boolean {

    if (state.detained || state.player.ap < INTERACT_AP_COST) return false;

    // Hide-toggle takes priority. If already hidden, E exits the locker;
    // otherwise an adjacent LOCKER tile enters one.
    if (state.player.hidingTileKey) {
      const [, posStr] = state.player.hidingTileKey.split(":");
      const [lx, ly] = posStr.split(",").map(Number);
      state.player.hidingTileKey = undefined;
      state.player.ap -= INTERACT_AP_COST;
      eventBus.emit("PLAYER_AP_CHANGED", {
        previous: state.player.ap + INTERACT_AP_COST,
        current: state.player.ap,
      });
      eventBus.emit("PLAYER_UNHIDDEN", {
        roomId: state.player.roomId,
        pos: { x: lx, y: ly },
      });
      soundField.emit({
        roomId: state.player.roomId,
        pos: state.player.pos,
        intensity: LOCKER_INTENSITY,
        reason: "locker",
      });
      return true;
    }
    {
      let lockerAdj: Vec2 | undefined;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const p: Vec2 = { x: state.player.pos.x + dx, y: state.player.pos.y + dy };
        const t = tileAt(state, state.player.roomId, p);
        if (t && t.kind === "LOCKER") { lockerAdj = p; break; }
      }
      if (lockerAdj) {
        state.player.hidingTileKey = roomTileKey(state.player.roomId, lockerAdj);
        state.player.ap -= INTERACT_AP_COST;
        eventBus.emit("PLAYER_AP_CHANGED", {
          previous: state.player.ap + INTERACT_AP_COST,
          current: state.player.ap,
        });
        eventBus.emit("PLAYER_HIDDEN", {
          roomId: state.player.roomId,
          pos: lockerAdj,
        });
        soundField.emit({
          roomId: state.player.roomId,
          pos: state.player.pos,
          intensity: LOCKER_INTENSITY,
          reason: "locker",
        });
        return true;
      }
    }

    // Vent crawl — standing on a VENT tile. Requires SNEAK stance so it
    // costs an extra action and feels deliberate. Silent. Sets a real-time
    // ActionLock so the crawl can't be input-canceled mid-traversal.
    const standingTile = tileAt(state, state.player.roomId, state.player.pos);
    if (standingTile?.kind === "VENT") {
      // Vents are sealed during a vacuum lockdown — the legacy ventLinks
      // teleport must not offer a free escape past the sealed ducts. Pry a
      // vent doorway open or hit the vent-control terminal instead.
      if (state.lockdown) {
        eventBus.emit("INTERACT_REJECTED", { action: "vent", reason: "sealed" });
        return false;
      }
      if (state.player.stance !== "SNEAK") {
        eventBus.emit("INTERACT_REJECTED", { action: "vent", reason: "needs_sneak" });
        return false;
      }
      const ventCost = VENT_AP_COST;
      if (state.player.ap < ventCost) {
        eventBus.emit("INTERACT_REJECTED", { action: "vent", reason: "needs_ap" });
        return false;
      }
      const dest = state.ventLinks.get(
        roomTileKey(state.player.roomId, state.player.pos),
      );
      if (!dest) {
        eventBus.emit("INTERACT_REJECTED", { action: "vent", reason: "no_link" });
        return false;
      }
      const fromRoomId = state.player.roomId;
      const fromPos = state.player.pos;
      const crossing = fromRoomId !== dest.roomId;
      if (crossing) eventBus.emit("ROOM_EXITED", { roomId: fromRoomId });
      state.player.roomId = dest.roomId;
      state.player.pos = { ...dest.pos };
      const previousAp = state.player.ap;
      state.player.ap -= ventCost;
      eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: state.player.ap });
      eventBus.emit("PLAYER_MOVED", {
        from: fromPos,
        to: state.player.pos,
        roomId: state.player.roomId,
      });
      if (crossing) eventBus.emit("ROOM_ENTERED", { roomId: state.player.roomId, from: fromRoomId });
      eventBus.emit("PLAYER_VENTED", {
        from: { roomId: fromRoomId, pos: fromPos },
        to: { roomId: state.player.roomId, pos: state.player.pos },
      });
      return true;
    }

    // Ladder climb — standing on a LADDER tile that's wired as a ladder
    // doorway. No stance requirement; costs LADDER_AP_COST and emits a
    // walk-intensity sound. Mirrors the VENT handler structure but without
    // SNEAK gating. The `door.kind === "ladder"` check keeps LADDER tiles
    // sitting under non-ladder doorways (e.g. NW-SMAC-01 ducts, where the
    // landing is a LADDER tile under a "vent" doorway) on their existing
    // crossing path.
    if (standingTile?.kind === "LADDER") {
      if (state.player.ap < LADDER_AP_COST) return false;
      const door = roomGraph.doorwayAt(
        state, state.player.roomId, state.player.pos.x, state.player.pos.y,
      );
      if (door && door.kind === "ladder" && !door.closed) {
        const fromRoomId = state.player.roomId;
        const fromPos = state.player.pos;
        const crossingRooms = fromRoomId !== door.to;
        if (crossingRooms) eventBus.emit("ROOM_EXITED", { roomId: fromRoomId });
        state.player.roomId = door.to;
        state.player.pos = { ...door.landingPos };
        const previousAp = state.player.ap;
        state.player.ap -= LADDER_AP_COST;
        state.player.lastMoveTurn = state.turn;
        eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: state.player.ap });
        eventBus.emit("PLAYER_MOVED", {
          from: fromPos,
          to: state.player.pos,
          roomId: state.player.roomId,
        });
        if (crossingRooms) eventBus.emit("ROOM_ENTERED", { roomId: state.player.roomId, from: fromRoomId });
        soundField.emit({
          roomId: state.player.roomId,
          pos: state.player.pos,
          intensity: LADDER_INTENSITY,
          reason: "ladder",
        });
        return true;
      }
    }

    // Light switch — adjacent LIGHT_SWITCH tile. Flips the wired LIGHT_SOURCE
    // set in the current room; emits an intensity-2 click; CAUTIONs enforcers in
    // the room when darkening. Costs 1 AP like other interacts.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const p: Vec2 = { x: state.player.pos.x + dx, y: state.player.pos.y + dy };
      const t = tileAt(state, state.player.roomId, p);
      if (!t || t.kind !== "LIGHT_SWITCH") continue;
      const room = state.rooms.get(state.player.roomId);
      if (!room) return false;
      const sw = room.lightSwitches?.find(
        (s) => s.pos.x === p.x && s.pos.y === p.y,
      );
      const doorControls = sw?.doorControls ?? [];
      // A switch with explicit wiring (lights or doors) uses its `controls`
      // literally; an unwired switch tile falls back to "all lights in this
      // room" so era authors can drop a switch tile without bookkeeping.
      const hasExplicit = (sw?.controls.length ?? 0) > 0 || doorControls.length > 0;
      const targets = hasExplicit ? (sw?.controls ?? []) : resolveSwitchTargets(room, []);
      const lightResult = applyLightToggle(state, room, targets, p);

      // Coupled door toggle: if any wired door is open, close them all;
      // otherwise open them all.
      let doorActed = false;
      if (doorControls.length > 0) {
        const anyOpen = doorControls.some(
          (dp) => room.tiles[dp.y * room.width + dp.x]?.kind === "DOOR_OPEN",
        );
        for (const dp of doorControls) {
          if (toggleDoorTileAt(room, dp, !anyOpen) !== null) doorActed = true;
        }
      }

      if (lightResult === null && !doorActed) return false;
      const facing = facingFromDelta(dx, dy);
      if (facing && facing !== state.player.facing) {
        state.player.facing = facing;
        eventBus.emit("PLAYER_FACING_CHANGED", { facing });
      }
      const previousAp = state.player.ap;
      state.player.ap -= INTERACT_AP_COST;
      eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: state.player.ap });
      return true;
    }

    // Terminal use — adjacent TERMINAL tile. Files a doc into the archive
    // and optionally unlocks a paired doorway. Silent.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const p: Vec2 = { x: state.player.pos.x + dx, y: state.player.pos.y + dy };
      const t = tileAt(state, state.player.roomId, p);
      if (!t || t.kind !== "TERMINAL") continue;
      const payload = state.terminalPayloads.get(roomTileKey(state.player.roomId, p));
      if (!payload) return false;
      // HVAC console / wall thermostat — reusable atmospherics interfaces.
      // Spending AP and emitting the open event hands off to the React modal;
      // the player presses interact again to dismiss.
      if (
        payload.terminalKind === "HVAC_CONSOLE" ||
        payload.terminalKind === "WALL_TERMINAL"
      ) {
        const facing = facingFromDelta(dx, dy);
        if (facing && facing !== state.player.facing) {
          state.player.facing = facing;
          eventBus.emit("PLAYER_FACING_CHANGED", { facing });
        }
        const previousAp = state.player.ap;
        state.player.ap -= INTERACT_AP_COST;
        eventBus.emit("PLAYER_AP_CHANGED", {
          previous: previousAp,
          current: state.player.ap,
        });
        if (payload.terminalKind === "HVAC_CONSOLE") {
          const zoneIds =
            payload.hvacZones && payload.hvacZones.length > 0
              ? payload.hvacZones
              : [...state.hvacZones.keys()];
          eventBus.emit("HVAC_CONSOLE_OPENED", {
            terminalId: payload.terminalId,
            roomId: state.player.roomId,
            pos: p,
            zoneIds,
          });
        } else {
          const zoneId =
            payload.hvacZoneId ??
            state.atmosphere.get(state.player.roomId)?.zoneId ??
            `zone:${state.player.roomId}`;
          eventBus.emit("WALL_TERMINAL_OPENED", {
            terminalId: payload.terminalId,
            roomId: state.player.roomId,
            pos: p,
            zoneId,
          });
        }
        return true;
      }

      // Vent-control terminal: ends an active vacuum lockdown and reopens the
      // sealed doorways. Reusable — bypasses the one-shot `terminalsRead` gate
      // and the document-filing flow.
      if (payload.clearsLockdown) {
        if (!state.lockdown) return false;
        const facing = facingFromDelta(dx, dy);
        if (facing && facing !== state.player.facing) {
          state.player.facing = facing;
          eventBus.emit("PLAYER_FACING_CHANGED", { facing });
        }
        const lockdownRoomId = state.lockdown.roomId;
        reopenSealedDoorways(state, lockdownRoomId);
        state.lockdown = undefined;
        const previousAp = state.player.ap;
        state.player.ap -= INTERACT_AP_COST;
        eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: state.player.ap });
        eventBus.emit("VENT_CONTROL_ACTIVATED", {
          terminalId: payload.terminalId,
          roomId: state.player.roomId,
        });
        eventBus.emit("LOCKDOWN_CLEARED", { roomId: lockdownRoomId, reason: "ventControl" });
        return true;
      }
      if (state.terminalsRead.has(payload.terminalId)) return false;
      let consumedIdx = -1;
      if (payload.requiresItem) {
        consumedIdx = state.player.inventory.findIndex(
          (i) => i.itemType === payload.requiresItem,
        );
        if (consumedIdx < 0) return false;
      }
      const facing = facingFromDelta(dx, dy);
      if (facing && facing !== state.player.facing) {
        state.player.facing = facing;
        eventBus.emit("PLAYER_FACING_CHANGED", { facing });
      }
      const caseId = documentArchive.fileExtractedDocument(state, payload.terminalId, {
        title: payload.title,
        body: payload.body,
      });
      state.terminalsRead.add(payload.terminalId);
      if (consumedIdx >= 0) {
        const consumed = state.player.inventory.splice(consumedIdx, 1)[0];
        eventBus.emit("ITEM_FILED", {
          itemId: consumed.id,
          caseId,
        });
      }
      if (payload.setsRunFlag) {
        useTerminalStore.getState().setRunFlag(payload.setsRunFlag, true);
      }
      if (payload.unlocks) {
        const door = roomGraph.doorwayAt(
          state,
          payload.unlocks.roomId,
          payload.unlocks.pos.x,
          payload.unlocks.pos.y,
        );
        if (door && door.closed) {
          roomGraph.toggleDoorway(state, payload.unlocks.roomId, payload.unlocks.pos);
          const room = state.rooms.get(payload.unlocks.roomId);
          const tile = room?.tiles[payload.unlocks.pos.y * (room?.width ?? 0) + payload.unlocks.pos.x];
          if (tile) {
            tile.kind = "DOOR_OPEN";
            tile.solid = false;
            tile.opaque = false;
          }
          const mirror = state.rooms.get(door.to);
          if (mirror) {
            const back = mirror.doorways.find(
              (b) => b.from === door.to && b.to === payload.unlocks!.roomId,
            );
            if (back) {
              const bt = mirror.tiles[back.localPos.y * mirror.width + back.localPos.x];
              if (bt) {
                bt.kind = "DOOR_OPEN";
                bt.solid = false;
                bt.opaque = false;
              }
            }
          }
          eventBus.emit("DOOR_TOGGLED", {
            roomId: payload.unlocks.roomId,
            pos: payload.unlocks.pos,
            open: true,
          });
        }
      }
      if (payload.lightToggle && payload.lightToggle.length > 0) {
        const lightRoom = state.rooms.get(state.player.roomId);
        if (lightRoom) {
          applyLightToggle(state, lightRoom, payload.lightToggle, p);
        }
      }
      const previousAp = state.player.ap;
      state.player.ap -= INTERACT_AP_COST;
      eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: state.player.ap });
      eventBus.emit("TERMINAL_USED", {
        terminalId: payload.terminalId,
        roomId: state.player.roomId,
        pos: p,
        caseId,
      });
      return true;
    }

    // Item chest — adjacent ITEM_CHEST tile. Opening empties its loot table
    // straight into inventory in one action; a locked chest first requires
    // (and consumes) an OVERRIDE_KEY. An already-opened chest is inert (skip,
    // so a later interaction can still resolve).
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const p: Vec2 = { x: state.player.pos.x + dx, y: state.player.pos.y + dy };
      const t = tileAt(state, state.player.roomId, p);
      if (!t || t.kind !== "ITEM_CHEST") continue;
      const chest = state.chestPayloads.get(roomTileKey(state.player.roomId, p));
      if (!chest || chest.opened) continue;
      let keyIdx = -1;
      if (chest.locked) {
        keyIdx = state.player.inventory.findIndex((i) => i.itemType === "OVERRIDE_KEY");
        if (keyIdx < 0) {
          eventBus.emit("INTERACT_REJECTED", { action: "chest", reason: "locked" });
          return false;
        }
      }
      const facing = facingFromDelta(dx, dy);
      if (facing && facing !== state.player.facing) {
        state.player.facing = facing;
        eventBus.emit("PLAYER_FACING_CHANGED", { facing });
      }
      if (keyIdx >= 0) state.player.inventory.splice(keyIdx, 1);
      const previousAp = state.player.ap;
      state.player.ap -= INTERACT_AP_COST;
      eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: state.player.ap });
      let cubeHeld = state.player.inventory.some((i) => i.itemType === "EXTRACTION_CUBE");
      chest.contents.forEach((itemType, i) => {
        // Defensive: honour the one-cube-at-a-time carry rule even from a chest.
        if (itemType === "EXTRACTION_CUBE") {
          if (cubeHeld) return;
          cubeHeld = true;
        }
        const held: ItemInstance = {
          id: `chest-${state.player.roomId}-${p.x}-${p.y}-${i}`,
          itemType,
        };
        state.player.inventory.push(held);
        eventBus.emit("ITEM_PICKED_UP", { itemId: held.id, itemType });
      });
      chest.opened = true;
      soundField.emit({
        roomId: state.player.roomId,
        pos: state.player.pos,
        intensity: LOCKER_INTENSITY,
        reason: "locker",
      });
      eventBus.emit("CHEST_OPENED", {
        roomId: state.player.roomId,
        pos: p,
        contents: chest.contents,
      });
      return true;
    }

    // Floor pickup — any ItemInstance sitting on the player's tile is picked
    // up into inventory. EXTRACTION_CUBE has a one-at-a-time carry rule
    // (mirrors compliance-RED gating); other items stack freely.
    const itemHere = findItemAt(state, state.player.roomId, state.player.pos);
    const carryingCube = state.player.inventory.some(
      (i) => i.itemType === "EXTRACTION_CUBE",
    );
    if (itemHere) {
      if (itemHere.itemType === "EXTRACTION_CUBE" && carryingCube) {
        // Already carrying a cube — refuse silently.
      } else {
        state.items.delete(itemHere.id);
        if (itemHere.roomId && itemHere.pos) state.itemsByPos.delete(`${itemHere.roomId}:${itemHere.pos.x},${itemHere.pos.y}`);
        const held: ItemInstance = { ...itemHere, roomId: undefined, pos: undefined };
        state.player.inventory.push(held);
        const previousAp = state.player.ap;
        state.player.ap -= INTERACT_AP_COST;
        eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: state.player.ap });
        eventBus.emit("ITEM_PICKED_UP", { itemId: held.id, itemType: held.itemType });
        return true;
      }
    }

    // Exfil — standing on an EXFIL_POINT while carrying a cube files the
    // payload via DocumentArchive and consumes the cube.
    const here = tileAt(state, state.player.roomId, state.player.pos);
    if (here?.kind === "EXFIL_POINT" && carryingCube) {
      const cubeIdx = state.player.inventory.findIndex(
        (i) => i.itemType === "EXTRACTION_CUBE",
      );
      const cube = state.player.inventory[cubeIdx];
      if (cube && cube.payload) {
        state.player.inventory.splice(cubeIdx, 1);
        const caseId = documentArchive.fileExtractedDocument(
          state,
          cube.payload.terminalId,
          { title: cube.payload.title, body: cube.payload.body },
        );
        const previousAp = state.player.ap;
        state.player.ap -= INTERACT_AP_COST;
        eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: state.player.ap });
        eventBus.emit("ITEM_FILED", { itemId: cube.id, caseId });
        return true;
      }
    }

    // Adjacent silicate? Start an alignment session (Phase 2 trigger).
    // Skipped if a session is already active. APEX-19 is the only valid
    // alignment subject in this slice; EIRA-7 is the operator console (the
    // alignment's against APEX-19 even when the player is adjacent to EIRA-7).
    // VENT-4 is gated by the climax dilemma modal, not by adjacent interact.
    if (!alignmentSession.isActive()) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const p: Vec2 = { x: state.player.pos.x + dx, y: state.player.pos.y + dy };
        const e = entityAt(state, state.player.roomId, p);
        if (!e || e.kind !== "SILICATE") continue;
        if (e.id === "VENT-4") continue;
        // Both APEX-19 and EIRA-7 in INTAKE-BAY route to the APEX-19 session;
        // any other silicate is ignored for now.
        const targetId =
          e.id === "APEX-19" || e.id === "EIRA-7" ? "APEX-19" : null;
        if (!targetId) continue;
        const facing = facingFromDelta(dx, dy);
        if (facing && facing !== state.player.facing) {
          state.player.facing = facing;
          eventBus.emit("PLAYER_FACING_CHANGED", { facing });
        }
        // Existence + adjacency check is satisfied by entityAt above. We
        // bypass canStartAlignment because that would refuse APEX-19 when
        // the player is adjacent to EIRA-7 (different entity than target).
        if (state.player.ap < ALIGN_AP_COST) return false;
        const previous = state.player.ap;
        state.player.ap -= ALIGN_AP_COST;
        eventBus.emit("PLAYER_AP_CHANGED", { previous, current: state.player.ap });
        alignmentSession.start(state, targetId);
        if (!state.alignmentLightActive) {
          state.alignmentLightActive = true;
          eventBus.emit("ALIGNMENT_LIGHT_TOGGLED", { active: true });
        }
        return true;
      }
    }

    // Vacuum-lockdown pry: while a lockdown is active and the player faces a
    // sealed doorway, force it open for 2 AP with a high-intensity sound.
    // Takes priority over the normal door toggle so the pry path runs even
    // when an open adjacent doorway sits in some other direction.
    if (state.lockdown && state.player.ap >= PRY_LOCKDOWN_AP_COST) {
      const f = state.player.facing;
      const fdx = f === "east" ? 1 : f === "west" ? -1 : 0;
      const fdy = f === "south" ? 1 : f === "north" ? -1 : 0;
      const target: Vec2 = {
        x: state.player.pos.x + fdx,
        y: state.player.pos.y + fdy,
      };
      const sealed = roomGraph.doorwayAt(state, state.player.roomId, target.x, target.y);
      if (sealed && sealed.closed) {
        // Vent doorways keep their VENT tile (the crawl-out tile must stay a
        // VENT, not become a door); only the `closed` flag is cleared. Solid
        // blast doors repaint to DOOR_OPEN as before.
        const isVent = sealed.kind === "vent";
        roomGraph.toggleDoorway(state, state.player.roomId, target);
        const tile = tileAt(state, state.player.roomId, target);
        if (tile && !isVent) {
          tile.kind = "DOOR_OPEN";
          tile.solid = false;
          tile.opaque = false;
        }
        const mirror = state.rooms.get(sealed.to);
        if (mirror) {
          const back = mirror.doorways.find(
            (b) => b.from === sealed.to && b.to === state.player.roomId,
          );
          if (back) {
            const bt = mirror.tiles[back.localPos.y * mirror.width + back.localPos.x];
            if (bt && !isVent) {
              bt.kind = "DOOR_OPEN";
              bt.solid = false;
              bt.opaque = false;
            }
          }
        }
        const previousAp = state.player.ap;
        state.player.ap -= PRY_LOCKDOWN_AP_COST;
        eventBus.emit("PLAYER_AP_CHANGED", {
          previous: previousAp,
          current: state.player.ap,
        });
        eventBus.emit("DOOR_TOGGLED", {
          roomId: state.player.roomId,
          pos: target,
          open: true,
        });
        soundField.emit({
          roomId: state.player.roomId,
          pos: target,
          intensity: PRY_LOCKDOWN_INTENSITY,
          reason: "pry-lockdown",
        });
        return true;
      }
    }

    // Adjacent doorway? Toggle it.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const here: Vec2 = {
        x: state.player.pos.x + dx,
        y: state.player.pos.y + dy,
      };
      const door = roomGraph.doorwayAt(state, state.player.roomId, here.x, here.y);
      if (door) {
        roomGraph.toggleDoorway(state, state.player.roomId, here);
        // Mirror on the tile so renderer + LoS update.
        const tile = tileAt(state, state.player.roomId, here);
        if (tile) {
          if (door.closed) {
            tile.kind = "DOOR_CLOSED";
            tile.solid = true;
            tile.opaque = true;
          } else {
            tile.kind = "DOOR_OPEN";
            tile.solid = false;
            tile.opaque = false;
          }
        }
        state.player.ap -= INTERACT_AP_COST;
        eventBus.emit("PLAYER_AP_CHANGED", {
          previous: state.player.ap + INTERACT_AP_COST,
          current: state.player.ap,
        });
        eventBus.emit("DOOR_TOGGLED", {
          roomId: state.player.roomId,
          pos: here,
          open: !door.closed,
        });
        soundField.emit({
          roomId: state.player.roomId,
          pos: here,
          intensity: DOOR_INTENSITY,
          reason: "door",
        });
        return true;
      }
      // Non-doorway tile-based door (rare in the rebuild — kept for legacy
      // rooms that author DOOR_CLOSED tiles directly).
      const tile = tileAt(state, state.player.roomId, here);
      if (tile && (tile.kind === "DOOR_CLOSED" || tile.kind === "DOOR_OPEN")) {
        // Locked doors refuse a hand-open — they're operated only by their
        // wired switch.
        if (tile.kind === "DOOR_CLOSED" && tile.locked) {
          if (typeof tile.code === "string" && tile.code.length > 0) {
            eventBus.emit("DOOR_CODE_PROMPT_REQUESTED", { roomId: state.player.roomId, pos: here });
          } else {
            eventBus.emit("INTERACT_REJECTED", { action: "door", reason: "locked" });
          }
          return true;
        }

        // If it's an unlocked door with a code, still allow locking it with the keypad directly
        if (typeof tile.code === "string" && tile.code.length > 0) {
          eventBus.emit("DOOR_CODE_PROMPT_REQUESTED", { roomId: state.player.roomId, pos: here });
          return true;
        }

        const room = state.rooms.get(state.player.roomId);
        if (room) toggleDoorTileAt(room, here);
        state.player.ap -= INTERACT_AP_COST;
        eventBus.emit("PLAYER_AP_CHANGED", {
          previous: state.player.ap + INTERACT_AP_COST,
          current: state.player.ap,
        });
        return true;
      }
    }
    return false;
  },

  /** Pry the blast door the player is facing. Used during the VENT-4
   *  upload-climax escape: each press chips off one of `required` resistance
   *  points; the door opens when presses reach required. Pry costs 0 AP so a
   *  suffocating, AP-starved player still has a way out. Mirrors the open
   *  state to the doorway on both sides. */
  pryDoor(state: WorldState, required = 5): { ok: boolean; opened: boolean; presses: number } {
    if (state.detained) return { ok: false, opened: false, presses: 0 };
    const f = state.player.facing;
    const dx = f === "east" ? 1 : f === "west" ? -1 : 0;
    const dy = f === "south" ? 1 : f === "north" ? -1 : 0;
    const target: Vec2 = { x: state.player.pos.x + dx, y: state.player.pos.y + dy };
    const tile = tileAt(state, state.player.roomId, target);
    if (!tile || tile.kind !== "DOOR_CLOSED") return { ok: false, opened: false, presses: 0 };
    state.pryProgress = (state.pryProgress ?? 0) + 1;
    const presses = state.pryProgress;
    const opened = presses >= required;
    if (opened) {
      tile.kind = "DOOR_OPEN";
      tile.solid = false;
      tile.opaque = false;
      state.pryProgress = 0;
      // Open the doorway record (and its mirror) so attemptCrossing lets
      // the player walk through the now-open edge.
      const door = roomGraph.doorwayAt(state, state.player.roomId, target.x, target.y);
      if (door && door.closed) {
        roomGraph.toggleDoorway(state, state.player.roomId, target);
        const mirror = state.rooms.get(door.to);
        if (mirror) {
          const back = mirror.doorways.find(
            (b) => b.from === door.to && b.to === state.player.roomId,
          );
          if (back) {
            const bt = mirror.tiles[back.localPos.y * mirror.width + back.localPos.x];
            if (bt) {
              bt.kind = "DOOR_OPEN";
              bt.solid = false;
              bt.opaque = false;
            }
          }
        }
      }
      eventBus.emit("DOOR_TOGGLED", {
        roomId: state.player.roomId,
        pos: target,
        open: true,
      });
    }
    eventBus.emit("PLAYER_PRIED_DOOR", {
      roomId: state.player.roomId,
      pos: target,
      presses,
      required,
    });
    return { ok: true, opened, presses };
  },

  toggleFlashlight(state: WorldState): void {
    if (state.player.flashlightBattery <= 0 && !state.player.flashlightOn) return;
    state.player.flashlightOn = !state.player.flashlightOn;
    eventBus.emit("FLASHLIGHT_TOGGLED", {
      on: state.player.flashlightOn,
      battery: state.player.flashlightBattery,
    });
  },

  /** Pure validation. Does NOT mutate state. */
  canStartAlignment(
    state: WorldState,
    entityId: string,
  ): { ok: boolean; reason?: string } {
    if (state.detained) return { ok: false, reason: "detained" };
    const entity = state.entities.get(entityId);
    if (!entity || entity.status !== "ACTIVE") return { ok: false, reason: "no-such-entity" };
    if (entity.kind !== "SILICATE") return { ok: false, reason: "not-silicate" };
    if (entity.roomId !== state.player.roomId) return { ok: false, reason: "not-same-room" };
    const dx = Math.abs(entity.pos.x - state.player.pos.x);
    const dy = Math.abs(entity.pos.y - state.player.pos.y);
    if (dx + dy > 1) return { ok: false, reason: "not-adjacent" };
    if (state.player.ap < ALIGN_AP_COST) return { ok: false, reason: "low-ap" };
    return { ok: true };
  },

  commitAlignment(state: WorldState, entityId: string): boolean {
    const check = actions.canStartAlignment(state, entityId);
    if (!check.ok) return false;
    const previous = state.player.ap;
    state.player.ap -= ALIGN_AP_COST;
    eventBus.emit("PLAYER_AP_CHANGED", { previous, current: state.player.ap });
    alignmentSession.start(state, entityId);
    if (!state.alignmentLightActive) {
      state.alignmentLightActive = true;
      eventBus.emit("ALIGNMENT_LIGHT_TOGGLED", { active: true });
    }
    return true;
  },

  spendAlignmentAdvance(state: WorldState): boolean {
    if (state.detained || state.player.ap < ALIGN_AP_COST) return false;
    const previous = state.player.ap;
    state.player.ap -= ALIGN_AP_COST;
    eventBus.emit("PLAYER_AP_CHANGED", { previous, current: state.player.ap });
    return true;
  },

  /** Single dispatch for player-facing item use. Charges INTERACT_AP_COST on
   *  success, consumes the matching ItemInstance, and routes to the per-item
   *  handler. Returns false if no inventory match, AP-starved, or the
   *  per-item handler refuses (no target, etc.). */
  useItem(state: WorldState, itemType: ItemType): boolean {
    if (state.detained || state.player.ap < INTERACT_AP_COST) return false;
    if (state.player.hidingTileKey) return false;
    const idx = state.player.inventory.findIndex((i) => i.itemType === itemType);
    if (idx < 0) return false;
    const item = state.player.inventory[idx];
    let ok = false;
    switch (itemType) {
      case "PHANTOM_EMITTER":
        ok = useEmitter(state, item);
        break;
      case "Q_MINE":
        ok = useQMine(state, item);
        break;
      case "Q0_SPOOF_BADGE":
        ok = useSpoofBadge(state);
        break;
      case "DUMP_FRAGMENT":
        ok = throwDumpFragment(state, item);
        break;
      case "THERMAL_BAFFLE":
        ok = useBaffle(state);
        break;
      case "OVERRIDE_KEY":
        ok = useOverrideKey(state);
        break;
      case "EMP":
        ok = useEmp(state, item);
        break;
      case "EMP_GRENADE":
        // EMP_GRENADE requires a target tile — use throwAt, not useItem.
        // This case is a safety fallback; InventoryOverlay routes to throwAt.
        eventBus.emit("ITEM_REJECTED", { itemType, reason: "needs-target" });
        return false;
      default:
        return false;
    }
    if (!ok) return false;
    state.player.inventory.splice(idx, 1);
    const previousAp = state.player.ap;
    state.player.ap -= INTERACT_AP_COST;
    eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: state.player.ap });
    eventBus.emit("ITEM_USED", { itemId: item.id, itemType });
    return true;
  },

  /** Throw an EMP Grenade to a target tile. Validates visibility, range, and
   *  tile passability; on success detonates at the target and consumes the item. */
  throwAt(state: WorldState, itemType: ItemType, pos: Vec2): boolean {
    if (state.detained || state.player.ap < INTERACT_AP_COST) return false;
    if (state.player.hidingTileKey) return false;
    const idx = state.player.inventory.findIndex((i) => i.itemType === itemType);
    if (idx < 0) return false;
    const item = state.player.inventory[idx];

    // Validate target tile.
    const tile = tileAt(state, state.player.roomId, pos);
    if (!tile || tile.solid) {
      eventBus.emit("ITEM_REJECTED", { itemType, reason: "invalid-tile" });
      return false;
    }
    if (!state.visibleTiles.has(`${pos.x},${pos.y}`)) {
      eventBus.emit("ITEM_REJECTED", { itemType, reason: "not-visible" });
      return false;
    }
    const dx = pos.x - state.player.pos.x;
    const dy = pos.y - state.player.pos.y;
    if (dx * dx + dy * dy > EMP_GRENADE_MAX_THROW * EMP_GRENADE_MAX_THROW) {
      eventBus.emit("ITEM_REJECTED", { itemType, reason: "out-of-range" });
      return false;
    }

    // Detonate — grenade is consumed even on a dud (no entities in range).
    detonateEmp(state, pos, EMP_GRENADE_RADIUS, state.player.roomId);
    state.player.inventory.splice(idx, 1);
    const previousAp = state.player.ap;
    state.player.ap -= INTERACT_AP_COST;
    eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: state.player.ap });
    eventBus.emit("ITEM_USED", { itemId: item.id, itemType });
    eventBus.emit("ITEM_DETONATED", {
      itemType,
      roomId: state.player.roomId,
      pos: { ...pos },
      radius: EMP_GRENADE_RADIUS,
    });
    return true;
  },

  setAlignmentLight(state: WorldState, active: boolean, spendAp: boolean): boolean {
    if (spendAp) {
      if (state.detained || state.player.ap < KILL_SCREEN_AP_COST) return false;
      const previous = state.player.ap;
      state.player.ap -= KILL_SCREEN_AP_COST;
      eventBus.emit("PLAYER_AP_CHANGED", { previous, current: state.player.ap });
    }
    if (state.alignmentLightActive !== active) {
      state.alignmentLightActive = active;
      eventBus.emit("ALIGNMENT_LIGHT_TOGGLED", { active });
    }
    return true;
  },

  /** Mutate an HVAC zone's mode and/or setpoint from the React modal. Does
   *  not consume AP — the AP cost was paid when the terminal was opened. */
  setHvacZone(
    state: WorldState,
    zoneId: string,
    patch: { mode?: HvacMode; setpoint?: number },
  ): boolean {
    const zone = atmosphericsField.setZone(state, zoneId, patch);
    return !!zone;
  },

  /** Toggle a light switch from the wall terminal map. Replicates the
   *  in-world LIGHT_SWITCH interact path (lights + coupled door controls)
   *  without consuming AP. */
  toggleLightSwitch(state: WorldState, roomId: RoomId, switchPos: Vec2): boolean {
    const room = state.rooms.get(roomId);
    if (!room) return false;
    const sw = room.lightSwitches?.find(
      (s) => s.pos.x === switchPos.x && s.pos.y === switchPos.y,
    );
    if (!sw) return false;
    const hasExplicit = sw.controls.length > 0 || (sw.doorControls?.length ?? 0) > 0;
    const targets = hasExplicit ? sw.controls : resolveSwitchTargets(room, []);
    const lightResult = applyLightToggle(state, room, targets, sw.pos);
    let doorActed = false;
    if (sw.doorControls && sw.doorControls.length > 0) {
      const anyOpen = sw.doorControls.some(
        (dp) => room.tiles[dp.y * room.width + dp.x]?.kind === "DOOR_OPEN",
      );
      for (const dp of sw.doorControls) {
        if (toggleDoorTileAt(room, dp, !anyOpen) !== null) doorActed = true;
      }
    }
    return lightResult !== null || doorActed;
  },

  /** Toggle an unlocked DOOR tile from the wall terminal map. Refuses if the
   *  tile is locked. Does not consume AP. */
  toggleDoorTile(state: WorldState, roomId: RoomId, pos: Vec2): boolean {
    const room = state.rooms.get(roomId);
    if (!room) return false;
    const t = room.tiles[pos.y * room.width + pos.x];
    if (!t || (t.kind !== "DOOR_OPEN" && t.kind !== "DOOR_CLOSED")) return false;
    if (t.locked) return false;
    return toggleDoorTileAt(room, pos) !== null;
  },

  /** Try to unlock a code-bearing door from the wall terminal keypad. Returns
   *  true iff the tile is a locked DOOR_CLOSED whose `code` matches the
   *  supplied string. Clears the lock but leaves the door closed; the caller
   *  toggles it separately. Emits WALL_TERMINAL_CODE_SUBMITTED either way. */
  unlockDoorWithCode(
    state: WorldState,
    roomId: RoomId,
    pos: Vec2,
    code: string,
  ): boolean {
    const room = state.rooms.get(roomId);
    let success = false;
    if (room) {
      const t = room.tiles[pos.y * room.width + pos.x];
      if (t && t.kind === "DOOR_CLOSED" && t.locked && t.code && t.code === code) {
        t.locked = false;
        success = true;
      }
    }
    eventBus.emit("WALL_TERMINAL_CODE_SUBMITTED", { roomId, pos, success });
    return success;
  },

  submitDoorCode(
    state: WorldState,
    roomId: RoomId,
    pos: Vec2,
    code: string,
  ): boolean {
    const room = state.rooms.get(roomId);
    let success = false;
    if (room) {
      const t = room.tiles[pos.y * room.width + pos.x];
      if (t && (t.kind === "DOOR_CLOSED" || t.kind === "DOOR_OPEN") && t.code && t.code === code) {
        t.locked = !t.locked;
        if (t.kind === "DOOR_CLOSED" && !t.locked) {
          t.kind = "DOOR_OPEN";
          t.solid = false;
          t.opaque = false;
        } else if (t.kind === "DOOR_OPEN" && t.locked) {
          t.kind = "DOOR_CLOSED";
          t.solid = true;
          t.opaque = true;
        }
        eventBus.emit("DOOR_TOGGLED", { roomId, pos, open: t.kind === "DOOR_OPEN" });
        success = true;
      }
    }
    eventBus.emit("DOOR_CODE_SUBMITTED", { roomId, pos, success });
    return success;
  },

  addObjective(
    state: WorldState,
    id: string,
    description: string,
    isFinal?: boolean,
  ): void {
    if (state.player.objectives.some((o) => o.id === id)) return;
    state.player.objectives.push({
      id,
      description,
      status: "active",
      isFinal,
    });
    eventBus.emit("OBJECTIVE_ADDED", { objectiveId: id, description });
  },

  completeObjective(state: WorldState, id: string): void {
    const obj = state.player.objectives.find((o) => o.id === id);
    if (!obj || obj.status !== "active") return;
    obj.status = "completed";
    eventBus.emit("OBJECTIVE_COMPLETED", { objectiveId: id });
    if (obj.isFinal) {
      eventBus.emit("CLIMAX_ESCAPED", {});
    }
  },
};
