// Player action implementations. Mutates WorldState in place, then emits via
// the EventBus. One function per verb. Sound emission is centralised here so
// AlertFSM consumers see a consistent picture of "what the player did".

import type { Facing, ItemInstance, Room, Tile, Vec2, WorldState } from "../types/world.types";
import { facingFromDelta, roomTileKey } from "../types/world.types";
import { eventBus } from "./EventBus";
import { roomGraph } from "./RoomGraph";
import { soundField } from "./SoundField";
import { alignmentSession } from "./AlignmentSession";
import { alertFSM } from "./AlertFSM";
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

/** Flip the on/off state of a set of LIGHT_SOURCE tiles. Coupled toggle: if
 *  any is on, all go off; if all are off, all go on. Emits LIGHT_TOGGLED,
 *  invalidates the room's lit cache, propagates an intensity-2 click via
 *  SoundField, and — when darkening — immediately CAUTIONs guards in the
 *  affected room (synthetic AlertFSM sound input so they don't wait for the
 *  per-turn tick to react). Returns the new on/off state, or null if no
 *  valid targets. */
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
  soundField.emit({
    roomId: room.id,
    pos: originPos,
    intensity: 2,
    reason: "light_toggle",
  });
  // Immediate-CAUTION for guards in the darkening room — they perceive the
  // lights dropping right away, not at end-of-turn. Re-lighting is silent
  // toward guards (asymmetric by design — turning lights back on shouldn't
  // un-CAUTION an already-suspicious guard).
  if (!next) {
    for (const entity of state.entities.values()) {
      if (entity.kind !== "GUARD" || entity.status !== "ACTIVE") continue;
      if (entity.roomId !== room.id) continue;
      alertFSM.step(state, entity, {
        seesPlayer: false,
        heardIntensity: 2,
        heardSrc: { roomId: room.id, pos: originPos },
        playerPos: undefined,
        playerRoomId: state.player.roomId,
      });
    }
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

function findCubeAt(state: WorldState, roomId: string, p: Vec2): ItemInstance | undefined {
  for (const item of state.items.values()) {
    if (item.itemType !== "EXTRACTION_CUBE") continue;
    if (item.roomId !== roomId) continue;
    if (!item.pos) continue;
    if (item.pos.x === p.x && item.pos.y === p.y) return item;
  }
  return undefined;
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
      state.lockdown = undefined;
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
    if (!ventDoor && intensity > 0) {
      soundField.emit({
        roomId: state.player.roomId,
        pos: state.player.pos,
        intensity,
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
  state.player.pos = to;
  state.player.ap -= apCost;
  state.player.lastMoveTurn = state.turn;
  eventBus.emit("PLAYER_MOVED", { from: fromPos, to, roomId: fromRoomId });
  eventBus.emit("PLAYER_AP_CHANGED", {
    previous: state.player.ap + apCost,
    current: state.player.ap,
  });
  if (intensity > 0) {
    soundField.emit({ roomId: fromRoomId, pos: to, intensity, reason });
  }
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

  /** Rap on the wall the player is facing. Loud noise, lures guards. */
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
      if (state.player.stance !== "SNEAK") {
        eventBus.emit("INTERACT_REJECTED", { action: "vent", reason: "needs_sneak" });
        return false;
      }
      if (state.player.ap < VENT_AP_COST) {
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
      state.player.ap -= VENT_AP_COST;
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
    // set in the current room; emits an intensity-2 click; CAUTIONs guards in
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
      // If a switch tile exists but no wiring is declared, default to "all
      // lights in this room" so era authors can drop a switch tile without
      // bookkeeping every light.
      const targets = resolveSwitchTargets(room, sw?.controls ?? []);
      const result = applyLightToggle(state, room, targets, p);
      if (result === null) return false;
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

    // Cube pickup — standing on an EXTRACTION_CUBE that lives in this room
    // and tile, with an empty inventory, picks it up.
    const cubeHere = findCubeAt(state, state.player.roomId, state.player.pos);
    const carryingCube = state.player.inventory.some(
      (i) => i.itemType === "EXTRACTION_CUBE",
    );
    if (cubeHere && !carryingCube) {
      state.items.delete(cubeHere.id);
      const held: ItemInstance = { ...cubeHere, roomId: undefined, pos: undefined };
      state.player.inventory.push(held);
      const previousAp = state.player.ap;
      state.player.ap -= INTERACT_AP_COST;
      eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: state.player.ap });
      eventBus.emit("ITEM_PICKED_UP", { itemId: held.id, itemType: held.itemType });
      return true;
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
        roomGraph.toggleDoorway(state, state.player.roomId, target);
        const tile = tileAt(state, state.player.roomId, target);
        if (tile) {
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
            if (bt) {
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
        if (tile.kind === "DOOR_CLOSED") {
          tile.kind = "DOOR_OPEN";
          tile.solid = false;
          tile.opaque = false;
        } else {
          tile.kind = "DOOR_CLOSED";
          tile.solid = true;
          tile.opaque = true;
        }
        state.player.ap -= INTERACT_AP_COST;
        eventBus.emit("PLAYER_AP_CHANGED", {
          previous: state.player.ap + INTERACT_AP_COST,
          current: state.player.ap,
        });
        eventBus.emit("DOOR_TOGGLED", {
          roomId: state.player.roomId,
          pos: here,
          open: tile.kind === "DOOR_OPEN",
        });
        soundField.emit({
          roomId: state.player.roomId,
          pos: here,
          intensity: DOOR_INTENSITY,
          reason: "door",
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
};
