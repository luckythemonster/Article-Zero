// GuardSystem — per-tick guard behavior.
//
// Reads the `AlertFSM` level for each guard, picks a behavior, and steps.
//
// Cross-room pursuit: a guard in ALERT will follow the player through OPEN
// doorways, BFS-pathfinding the room graph toward `alert.lastStimulusRoom`.
// Sight triggers the lockdown trap as before, which slams every doorway in
// the player's room shut — so the spotter is trapped in the sealed room with
// the player until the player pries a door open and crosses out (clearing
// the lockdown). Once a door is open, the spotter pursues through it. After
// `ALERT_LOSE_SIGHT_TURNS` ticks without re-sighting, the guard drops to
// EVASION; once EVASION decays, `stepPatrol` walks it back to `homeRoomId`
// and resumes the authored patrol route mid-cycle.
//
// Only the spotter pursues. Other guards continue to escalate to CAUTION via
// SoundField and orient toward doorways (`stepInvestigate`) without crossing.

import type { Entity, Facing, RoomId, Tile, Vec2, WorldState } from "../types/world.types";
import { facingFromDelta } from "../types/world.types";
import { alertFSM } from "./AlertFSM";
import { eventBus } from "./EventBus";
import { interrogationSession } from "./InterrogationSession";
import { lightField } from "./LightField";
import { roomGraph } from "./RoomGraph";
import { computeCone, GUARD_BASE_RANGE, GUARD_CONE_HALF_ANGLE, GUARD_PROXIMITY_RADIUS } from "./VisionCone";
import type { DeliveredSound } from "./SoundField";
import { debugFlags } from "./debugFlags";

const LOCKDOWN_TURNS = 5;
/** A guard with no patrol route sweeps its FOV once every N turns rather than
 *  spinning a quarter-turn every tick. */
const IDLE_SCAN_PERIOD = 3;

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
      if (entity.status !== "ACTIVE") continue;
      if (
        entity.kind !== "GUARD" &&
        entity.kind !== "SURVEILLANCE_DRONE" &&
        entity.kind !== "SECURITY_CAMERA"
      ) {
        continue;
      }
      this.tickOne(state, entity, sounds.get(entity.id));
    }
  }

  private tickOne(state: WorldState, guard: Entity, heard?: DeliveredSound): void {
    // Subjective Dump Fragment stun — guard's local subjectivity-prevention
    // buffer overflowed; skip the entire tick (no vision, no FSM step, no
    // movement). Decrements once per turn until cleared.
    if (guard.alert && (guard.alert.stunTurnsRemaining ?? 0) > 0) {
      guard.alert.stunTurnsRemaining = (guard.alert.stunTurnsRemaining ?? 0) - 1;
      return;
    }
    if (guard.alert && (guard.alert.interrogateCooldown ?? 0) > 0) {
      guard.alert.interrogateCooldown = (guard.alert.interrogateCooldown ?? 0) - 1;
    }
    const sees = this.guardSeesPlayer(state, guard);
    // YELLOW interrogation: a clean-mask slip-up (qScore 1) reads as a person
    // of interest, not a target. On first sighting the Enforcer halts the
    // player for a checkpoint shakedown rather than investigating/chasing. The
    // modal phase pauses input + ticks until the player answers; pass keeps
    // them YELLOW (with a per-guard cooldown), fail escalates to RED.
    if (
      guard.kind === "GUARD" &&
      sees &&
      state.player.compliance === "YELLOW" &&
      !interrogationSession.isActive() &&
      (guard.alert?.interrogateCooldown ?? 0) === 0
    ) {
      interrogationSession.start(state, guard.id);
      return;
    }
    // Only an exposed (RED) player springs the lockdown trap — this mirrors the
    // AlertFSM's `seesAsAlert` gate. At GREEN the player reads as a TECH on
    // shift and can walk past in the open; at YELLOW the guard investigates
    // (CAUTION) but the room does not seal.
    const seesAsAlert = sees && state.player.compliance === "RED";
    if (seesAsAlert && !state.lockdown) {
      this.triggerLockdown(state);
    }
    alertFSM.step(state, guard, {
      seesPlayer: sees,
      heardIntensity: heard?.intensity ?? 0,
      heardSrc: heard?.src,
      // Always pass the player's true position so the FSM can refresh pursuit
      // tracking while ALERT. Sight gates (`seesAsAlert`/`seesAsYellow`) still
      // require same-room visibility, so this doesn't grant CAUTION omniscience.
      playerPos: state.player.pos,
      playerRoomId: state.player.roomId,
    });

    // Publish vision after the FSM has consumed it.
    const visible = this.visibleTiles(state, guard);
    eventBus.emit("GUARD_VISION_UPDATED", {
      guardId: guard.id,
      visibleTiles: Array.from(visible),
    });

    const level = guard.alert?.level ?? "NORMAL";

    // Security cameras share the detect/lockdown path above but never move —
    // they only turn their FOV. Hand off to the camera-only behavior and skip
    // the movement loop entirely.
    if (guard.kind === "SECURITY_CAMERA") {
      this.tickCamera(state, guard, level);
      return;
    }

    // Per-turn patrol bookkeeping (pause countdown, idle scan) runs once,
    // before the per-step movement loop, so a dwell decrements once per turn
    // regardless of stepsPerTurn. Returns true when the turn was spent
    // pausing/scanning in place — skip the movement loop entirely.
    if (level === "NORMAL" && this.stepPatrolTurn(state, guard)) return;

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
    // Proximity bubble: close enough that the guard notices regardless of
    // facing direction or lighting (footsteps, peripheral movement, etc).
    const dx = state.player.pos.x - guard.pos.x;
    const dy = state.player.pos.y - guard.pos.y;
    if (dx * dx + dy * dy <= GUARD_PROXIMITY_RADIUS * GUARD_PROXIMITY_RADIUS) return true;
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

  /** Once-per-turn patrol bookkeeping. Returns true if the turn was consumed in
   *  place (paused at a node, or idle-scanning a no-route guard), in which case
   *  the caller skips the per-step movement loop. */
  private stepPatrolTurn(state: WorldState, guard: Entity): boolean {
    // Displaced by a prior chase — let the movement loop walk it home via
    // pursueViaPath. Abandon any dwell carried over from before the chase so a
    // stale countdown can't strand the guard (stepPatrol early-returns while
    // paused). The route resumes from patrolIndex once it's home.
    if (guard.homeRoomId && guard.roomId !== guard.homeRoomId) {
      if ((guard.patrolPauseRemaining ?? 0) > 0) guard.patrolPauseRemaining = 0;
      return false;
    }

    const route = guard.patrol;
    if (!route || route.length === 0) {
      this.stepIdleScan(state, guard);
      return true;
    }

    // Dwelling at the current node: count down once per turn, sweeping the FOV
    // so a YELLOW/RED player can wander into a fresh facing. When the dwell
    // expires, advance to the next node so next turn the guard departs.
    if ((guard.patrolPauseRemaining ?? 0) > 0) {
      guard.patrolPauseRemaining = (guard.patrolPauseRemaining ?? 0) - 1;
      this.rotateScan(guard);
      if (guard.patrolPauseRemaining === 0) {
        this.advancePatrolIndex(guard, route.length);
      }
      return true;
    }

    return false;
  }

  private stepPatrol(state: WorldState, guard: Entity): void {
    // A dwelling guard never moves — leftover step-loop iterations after an
    // arrival are no-ops (the countdown is handled once/turn in stepPatrolTurn).
    if ((guard.patrolPauseRemaining ?? 0) > 0) return;

    // If a chase displaced this guard out of its home room, walk back before
    // resuming patrol. patrolIndex is preserved so the route resumes mid-cycle
    // rather than restarting at node 0.
    if (guard.homeRoomId && guard.roomId !== guard.homeRoomId) {
      this.pursueViaPath(state, guard, guard.homeRoomId);
      return;
    }
    const route = guard.patrol;
    if (!route || route.length === 0) return;
    const idx = (guard.patrolIndex ?? 0) % route.length;
    const node = route[idx];
    const wp = node.pos;
    if (guard.pos.x === wp.x && guard.pos.y === wp.y) {
      if (node.faceOnArrival && guard.facing !== node.faceOnArrival) {
        guard.facing = node.faceOnArrival;
        eventBus.emit("ENTITY_FACING_CHANGED", { entityId: guard.id, facing: guard.facing });
      }
      // Authored dwell: hold here for N turns (consumed by stepPatrolTurn)
      // before advancing. Otherwise move on immediately.
      if ((node.pause ?? 0) > 0) {
        guard.patrolPauseRemaining = node.pause;
        return;
      }
      this.advancePatrolIndex(guard, route.length);
      return;
    }
    this.advanceToward(state, guard, wp);
  }

  /** Advance patrolIndex per the route's traversal mode. "loop" cycles
   *  start→end→start; "pingpong" reverses at each end (tracked in patrolDir). */
  private advancePatrolIndex(guard: Entity, len: number): void {
    if (len <= 1) {
      guard.patrolIndex = 0;
      return;
    }
    const idx = guard.patrolIndex ?? 0;
    if ((guard.patrolMode ?? "loop") === "pingpong") {
      let dir = guard.patrolDir ?? 1;
      let next = idx + dir;
      if (next >= len) {
        dir = -1;
        next = len - 2;
      } else if (next < 0) {
        dir = 1;
        next = 1;
      }
      guard.patrolDir = dir;
      guard.patrolIndex = next;
    } else {
      guard.patrolIndex = (idx + 1) % len;
    }
  }

  /** No-route guard idle behavior: a slow FOV sweep on a fixed cadence so it
   *  scans the room without spinning a quarter-turn every tick. */
  private stepIdleScan(state: WorldState, guard: Entity): void {
    if (state.turn % IDLE_SCAN_PERIOD === 0) {
      this.rotateScan(guard);
    }
  }

  /** Step toward (or cross) the first-hop doorway leading to `targetRoomId`.
   *  No-ops if all doorways in the current room are closed (lockdown case)
   *  or if the target is unreachable through the open room graph. */
  private pursueViaPath(state: WorldState, guard: Entity, targetRoomId: RoomId): void {
    const path = roomGraph.bfsPath(state, guard.roomId, targetRoomId);
    const hop = path?.[0];
    if (!hop) return;
    if (guard.pos.x === hop.localPos.x && guard.pos.y === hop.localPos.y) {
      const from = guard.pos;
      const fromRoomId = guard.roomId;
      guard.roomId = hop.to;
      guard.pos = { ...hop.landingPos };
      guard.lastMoveTurn = state.turn;
      eventBus.emit("ENTITY_MOVED", {
        entityId: guard.id,
        roomId: fromRoomId,
        from,
        to: guard.pos,
      });
      return;
    }
    this.advanceToward(state, guard, hop.localPos);
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
    const targetRoomId = guard.alert?.lastStimulusRoom ?? state.player.roomId;

    if (guard.roomId !== targetRoomId) {
      // Different room from the last sighting — pursue through open doorways.
      // The lose-of-sight timer in AlertFSM decides when to give up.
      this.pursueViaPath(state, guard, targetRoomId);
      return;
    }

    // Same room as the last sighting. If the player is here, chase them
    // directly; otherwise chase the stale lastStimulus tile until the FSM
    // gives up.
    const dest = state.player.roomId === guard.roomId
      ? state.player.pos
      : (guard.alert?.lastStimulus ?? state.player.pos);
    this.advanceToward(state, guard, dest);

    if (state.player.roomId !== guard.roomId) return;
    if (guard.pos.x === state.player.pos.x && guard.pos.y === state.player.pos.y) {
      // Surveillance drones can't apprehend the player — reaching the player's
      // tile only flags detection. Detention in the duct comes solely from the
      // suffocation timer (WorldEngine.advanceTurn).
      if (guard.kind === "GUARD") {
        state.detained = true;
        eventBus.emit("PLAYER_DETAINED", { guardId: guard.id, turn: state.turn });
      } else {
        state.detected = true;
        eventBus.emit("PLAYER_DETECTED", { guardId: guard.id, pos: guard.pos });
      }
    } else {
      state.detected = true;
      eventBus.emit("PLAYER_DETECTED", { guardId: guard.id, pos: guard.pos });
    }
  }

  private stepCooldown(_state: WorldState, guard: Entity): void {
    // Rotate to scan: cycle through cardinal facings.
    this.rotateScan(guard);
  }

  /** Advance an entity one cardinal step clockwise (N→E→S→W→N), emitting a
   *  facing change. Shared by EVASION cooldown scanning and the camera's
   *  idle FOV sweep. */
  private rotateScan(entity: Entity): void {
    const cycle: Facing[] = ["north", "east", "south", "west"];
    const idx = cycle.indexOf(entity.facing);
    const next = cycle[(idx + 1) % cycle.length];
    if (next !== entity.facing) {
      entity.facing = next;
      eventBus.emit("ENTITY_FACING_CHANGED", { entityId: entity.id, facing: entity.facing });
    }
  }

  /** Per-tick behavior for a fixed SECURITY_CAMERA. It never moves: it sweeps
   *  its FOV while idle, and turns to face the threat once it has one. Sight
   *  already triggered lockdown in `tickOne`; here we only flag detection when
   *  actively tracking the player in the camera's own room. */
  private tickCamera(state: WorldState, cam: Entity, level: string): void {
    switch (level) {
      case "CAUTION":
        this.faceToward(cam, cam.alert?.lastStimulus);
        break;
      case "ALERT":
        this.faceToward(cam, state.player.pos);
        if (cam.roomId === state.player.roomId) {
          state.detected = true;
          eventBus.emit("PLAYER_DETECTED", { guardId: cam.id, pos: cam.pos });
        }
        break;
      // NORMAL and EVASION both keep the camera scanning its arc.
      default:
        this.rotateScan(cam);
        break;
    }
  }

  /** Turn an entity to face `target` without moving. No-ops if the target is
   *  missing or on the entity's own tile. */
  private faceToward(entity: Entity, target: Vec2 | undefined): void {
    if (!target) return;
    const dx = Math.sign(target.x - entity.pos.x);
    const dy = Math.sign(target.y - entity.pos.y);
    const facing = facingFromDelta(dx, dy);
    if (facing && facing !== entity.facing) {
      entity.facing = facing;
      eventBus.emit("ENTITY_FACING_CHANGED", { entityId: entity.id, facing });
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
