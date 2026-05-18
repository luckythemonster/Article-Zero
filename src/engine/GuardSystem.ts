// GuardSystem — per-tick guard behavior.
//
// Reads the `AlertFSM` level for each guard, picks a behavior, and steps.
// Guards do NOT pursue between rooms in the rebuild; if the player crosses
// a doorway during ALERT, the guard drops to EVASION on this side.

import type { Entity, Facing, Tile, Vec2, WorldState } from "../types/world.types";
import { facingFromDelta } from "../types/world.types";
import { alertFSM } from "./AlertFSM";
import { eventBus } from "./EventBus";
import { lightField } from "./LightField";
import { roomGraph } from "./RoomGraph";
import { computeCone, GUARD_BASE_RANGE, GUARD_CONE_HALF_ANGLE } from "./VisionCone";
import type { DeliveredSound } from "./SoundField";
import { debugFlags } from "./debugFlags";

const LOCKDOWN_TURNS = 5;

class GuardSystem {
  /** Compute the visible-tile set for one guard inside its current room.
   *  Masked by the room's lit set — guards can't see through unlit tiles. */
  visibleTiles(state: WorldState, guard: Entity): Set<string> {
    const room = state.rooms.get(guard.roomId);
    if (!room) return new Set();
    const cone = computeCone({
      tiles: room.tiles,
      width: room.width,
      height: room.height,
      ox: guard.pos.x,
      oy: guard.pos.y,
      radius: this.coneRange(room.ambientLight),
      facing: guard.facing,
      halfAngle: GUARD_CONE_HALF_ANGLE,
    });
    const lit = lightField.getOrCompute(room);
    const out = new Set<string>();
    const ownKey = `${guard.pos.x},${guard.pos.y}`;
    for (const k of cone) {
      if (k === ownKey || lit.has(k)) out.add(k);
    }
    return out;
  }

  /** Per-tick step: integrate sound + sight into AlertFSM, then act. */
  tick(state: WorldState, sounds: Map<string, DeliveredSound>): void {
    if (state.detained) return;
    if (debugFlags.disableEnforcerAI) return;
    for (const entity of state.entities.values()) {
      if (entity.kind !== "GUARD" || entity.status !== "ACTIVE") continue;
      this.tickOne(state, entity, sounds.get(entity.id));
    }
  }

  private tickOne(state: WorldState, guard: Entity, heard?: DeliveredSound): void {
    const sees = this.guardSeesPlayer(state, guard);
    if (sees && !state.lockdown) {
      this.triggerLockdown(state);
    }
    alertFSM.step(state, guard, {
      seesPlayer: sees,
      heardIntensity: heard?.intensity ?? 0,
      heardSrc: heard?.src,
      playerPos: state.player.roomId === guard.roomId ? state.player.pos : undefined,
      playerRoomId: state.player.roomId,
    });

    // Publish vision after the FSM has consumed it.
    const visible = this.visibleTiles(state, guard);
    eventBus.emit("GUARD_VISION_UPDATED", {
      guardId: guard.id,
      visibleTiles: Array.from(visible),
    });

    const level = guard.alert?.level ?? "NORMAL";
    const steps = Math.max(1, guard.stepsPerTurn ?? 1);
    for (let i = 0; i < steps; i++) {
      if (state.detained) return;
      switch (level) {
        case "NORMAL":
          this.stepPatrol(state, guard);
          break;
        case "CAUTION":
          this.stepInvestigate(state, guard);
          break;
        case "ALERT":
          this.stepChase(state, guard);
          break;
        case "EVASION":
          this.stepCooldown(state, guard);
          return;
      }
    }
  }

  private guardSeesPlayer(state: WorldState, guard: Entity): boolean {
    if (state.player.roomId !== guard.roomId) return false;
    // Hidden in a locker: guards may walk past and not perceive the player.
    if (state.player.hidingTileKey) return false;
    const room = state.rooms.get(guard.roomId);
    if (!room) return false;
    const visible = this.visibleTiles(state, guard);
    return visible.has(`${state.player.pos.x},${state.player.pos.y}`);
  }

  /** Seal every doorway in the player's current room and start the vacuum
   *  countdown. Mirrors the closure to each back-doorway so guards on the
   *  far side can't open them either. */
  private triggerLockdown(state: WorldState): void {
    const roomId = state.player.roomId;
    const room = state.rooms.get(roomId);
    if (!room) return;
    state.lockdown = { roomId, turnsRemaining: LOCKDOWN_TURNS };
    for (const d of room.doorways) {
      if (d.closed) continue;
      roomGraph.toggleDoorway(state, roomId, d.localPos);
      const tile = room.tiles[d.localPos.y * room.width + d.localPos.x];
      if (tile && (tile.kind === "DOOR_OPEN" || tile.kind === "DOOR_CLOSED")) {
        tile.kind = "DOOR_CLOSED";
        tile.solid = true;
        tile.opaque = true;
      }
      const dst = state.rooms.get(d.to);
      if (dst) {
        const back = dst.doorways.find(
          (b) => b.from === d.to && b.to === roomId,
        );
        if (back) {
          const bt = dst.tiles[back.localPos.y * dst.width + back.localPos.x];
          if (bt && (bt.kind === "DOOR_OPEN" || bt.kind === "DOOR_CLOSED")) {
            bt.kind = "DOOR_CLOSED";
            bt.solid = true;
            bt.opaque = true;
          }
        }
      }
      eventBus.emit("DOOR_TOGGLED", { roomId, pos: d.localPos, open: false });
    }
    eventBus.emit("LOCKDOWN_TRIGGERED", {
      roomId,
      turnsRemaining: LOCKDOWN_TURNS,
    });
  }

  private coneRange(ambient: "LIT" | "DIM" | "DARK"): number {
    if (ambient === "LIT") return GUARD_BASE_RANGE + 1;
    if (ambient === "DARK") return Math.max(2, GUARD_BASE_RANGE - 3);
    return GUARD_BASE_RANGE;
  }

  private stepPatrol(state: WorldState, guard: Entity): void {
    const route = guard.patrol;
    if (!route || route.length === 0) return;
    const idx = guard.patrolIndex ?? 0;
    const node = route[idx % route.length];
    const wp = node.pos;
    if (guard.pos.x === wp.x && guard.pos.y === wp.y) {
      guard.patrolIndex = (idx + 1) % route.length;
      if (node.faceOnArrival && guard.facing !== node.faceOnArrival) {
        guard.facing = node.faceOnArrival;
        eventBus.emit("ENTITY_FACING_CHANGED", { entityId: guard.id, facing: guard.facing });
      }
      return;
    }
    this.advanceToward(state, guard, wp);
  }

  private stepInvestigate(state: WorldState, guard: Entity): void {
    const target = guard.alert?.lastStimulus;
    if (!target) return;
    if (guard.alert?.lastStimulusRoom && guard.alert.lastStimulusRoom !== guard.roomId) {
      // Stimulus came from another room — orient toward the doorway that leads
      // there (if any) but don't cross.
      const room = state.rooms.get(guard.roomId);
      if (!room) return;
      const door = room.doorways.find((d) => d.to === guard.alert?.lastStimulusRoom);
      if (door) {
        this.advanceToward(state, guard, door.localPos);
      }
      return;
    }
    this.advanceToward(state, guard, target);
  }

  private stepChase(state: WorldState, guard: Entity): void {
    if (state.player.roomId !== guard.roomId) {
      // Player crossed into another room — drop to EVASION.
      if (guard.alert) {
        const prev = guard.alert.level;
        guard.alert.level = "EVASION";
        guard.alert.enteredTurn = state.turn;
        if (prev !== "EVASION") {
          eventBus.emit("GUARD_ALERT_CHANGED", { guardId: guard.id, from: prev, to: "EVASION" });
        }
      }
      return;
    }
    this.advanceToward(state, guard, state.player.pos);
    if (guard.pos.x === state.player.pos.x && guard.pos.y === state.player.pos.y) {
      state.detained = true;
      eventBus.emit("PLAYER_DETAINED", { guardId: guard.id, turn: state.turn });
    } else {
      state.detected = true;
      eventBus.emit("PLAYER_DETECTED", { guardId: guard.id, pos: guard.pos });
    }
  }

  private stepCooldown(_state: WorldState, guard: Entity): void {
    // Rotate to scan: cycle through cardinal facings.
    const cycle: Facing[] = ["north", "east", "south", "west"];
    const idx = cycle.indexOf(guard.facing);
    const next = cycle[(idx + 1) % cycle.length];
    if (next !== guard.facing) {
      guard.facing = next;
      eventBus.emit("ENTITY_FACING_CHANGED", { entityId: guard.id, facing: guard.facing });
    }
  }

  private advanceToward(state: WorldState, guard: Entity, target: Vec2): void {
    const room = state.rooms.get(guard.roomId);
    if (!room) return;
    const dx = Math.sign(target.x - guard.pos.x);
    const dy = Math.sign(target.y - guard.pos.y);
    if (dx === 0 && dy === 0) return;
    const next: Vec2 =
      Math.abs(target.x - guard.pos.x) >= Math.abs(target.y - guard.pos.y)
        ? { x: guard.pos.x + dx, y: guard.pos.y }
        : { x: guard.pos.x, y: guard.pos.y + dy };
    if (!this.canEnter(room.tiles, room.width, room.height, next)) return;
    const facing = facingFromDelta(next.x - guard.pos.x, next.y - guard.pos.y);
    if (facing && facing !== guard.facing) {
      guard.facing = facing;
      eventBus.emit("ENTITY_FACING_CHANGED", { entityId: guard.id, facing });
    }
    const from = guard.pos;
    guard.pos = next;
    guard.lastMoveTurn = state.turn;
    eventBus.emit("ENTITY_MOVED", { entityId: guard.id, roomId: guard.roomId, from, to: next });
    // Audio-only signal — does NOT route through SoundField (would let the
    // player exploit guard noise as a sonar ping into the alert FSM).
    eventBus.emit("GUARD_FOOTSTEP", { guardId: guard.id, roomId: guard.roomId, pos: next });
  }

  private canEnter(tiles: Tile[], w: number, h: number, p: Vec2): boolean {
    if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) return false;
    const tile = tiles[p.y * w + p.x];
    return !!tile && !tile.solid;
  }
}

export const guardSystem = new GuardSystem();
