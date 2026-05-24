// EnforcerSystem — per-tick enforcer behavior.
//
// Reads the `AlertFSM` level for each enforcer, picks a behavior, and steps.
//
// Cross-room pursuit: a enforcer in ALERT will follow the player through OPEN
// doorways, BFS-pathfinding the room graph toward `alert.lastStimulusRoom`.
// Sight triggers the lockdown trap as before, which slams every doorway in
// the player's room shut — so the spotter is trapped in the sealed room with
// the player until the player pries a door open and crosses out (clearing
// the lockdown). Once a door is open, the spotter pursues through it. After
// `ALERT_LOSE_SIGHT_TURNS` ticks without re-sighting, the enforcer drops to
// EVASION; once EVASION decays, `stepPatrol` walks it back to `homeRoomId`
// and resumes the authored patrol route mid-cycle.
//
// Only the spotter pursues. Other enforcers continue to escalate to CAUTION via
// SoundField and orient toward doorways (`stepInvestigate`) without crossing.

import type { Entity, Facing, RoomId, Tile, Vec2, WorldState } from "../types/world.types";
import { facingFromDelta } from "../types/world.types";
import { alertFSM } from "./AlertFSM";
import { eventBus } from "./EventBus";
import { interrogationSession } from "./InterrogationSession";
import { lightField } from "./LightField";
import { roomGraph } from "./RoomGraph";
import { computeCone, ENFORCER_BASE_RANGE, ENFORCER_CONE_HALF_ANGLE, ENFORCER_PROXIMITY_RADIUS } from "./VisionCone";
import type { DeliveredSound } from "./SoundField";
import { debugFlags } from "./debugFlags";

const LOCKDOWN_TURNS = 5;
/** A enforcer with no patrol route sweeps its FOV once every N turns rather than
 *  spinning a quarter-turn every tick. */
const IDLE_SCAN_PERIOD = 3;

class EnforcerSystem {
  /** Compute the visible-tile set for one enforcer inside its current room.
   *  Masked by the room's lit set — enforcers can't see through unlit tiles. */
  visibleTiles(state: WorldState, enforcer: Entity): Set<string> {
    const room = state.rooms.get(enforcer.roomId);
    if (!room) return new Set();
    const cone = computeCone({
      tiles: room.tiles,
      width: room.width,
      height: room.height,
      ox: enforcer.pos.x,
      oy: enforcer.pos.y,
      radius: this.coneRange(room.ambientLight),
      facing: enforcer.facing,
      halfAngle: ENFORCER_CONE_HALF_ANGLE,
    });
    const lit = lightField.getOrCompute(room);
    const out = new Set<string>();
    const ownKey = `${enforcer.pos.x},${enforcer.pos.y}`;
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
        entity.kind !== "ENFORCER" &&
        entity.kind !== "SURVEILLANCE_DRONE" &&
        entity.kind !== "SECURITY_CAMERA"
      ) {
        continue;
      }
      this.tickOne(state, entity, sounds.get(entity.id));
    }
  }

  private tickOne(state: WorldState, enforcer: Entity, heard?: DeliveredSound): void {
    // Subjective Dump Fragment stun — enforcer's local subjectivity-prevention
    // buffer overflowed; skip the entire tick (no vision, no FSM step, no
    // movement). Decrements once per turn until cleared.
    if (enforcer.alert && (enforcer.alert.stunTurnsRemaining ?? 0) > 0) {
      enforcer.alert.stunTurnsRemaining = (enforcer.alert.stunTurnsRemaining ?? 0) - 1;
      return;
    }
    if (enforcer.alert && (enforcer.alert.interrogateCooldown ?? 0) > 0) {
      enforcer.alert.interrogateCooldown = (enforcer.alert.interrogateCooldown ?? 0) - 1;
    }
    const sees = this.enforcerSeesPlayer(state, enforcer);
    // YELLOW interrogation: a clean-mask slip-up (qScore 1) reads as a person
    // of interest, not a target. On sighting the Enforcer halts the player for
    // a checkpoint shakedown rather than investigating/chasing. The modal phase
    // pauses input + ticks until the player answers; pass keeps them YELLOW
    // (with a per-enforcer cooldown), fail escalates to RED.
    if (this.canInterrogate(state, enforcer, sees)) {
      interrogationSession.start(state, enforcer.id);
      return;
    }
    // Only an exposed (RED) player springs the lockdown trap — this mirrors the
    // AlertFSM's `seesAsAlert` gate. At GREEN the player reads as a TECH on
    // shift and can walk past in the open; at YELLOW the enforcer investigates
    // (CAUTION) but the room does not seal.
    const seesAsAlert = sees && state.player.compliance === "RED";
    if (seesAsAlert && !state.lockdown) {
      this.triggerLockdown(state);
    }
    alertFSM.step(state, enforcer, {
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
    const visible = this.visibleTiles(state, enforcer);
    eventBus.emit("ENFORCER_VISION_UPDATED", {
      enforcerId: enforcer.id,
      visibleTiles: Array.from(visible),
    });

    const level = enforcer.alert?.level ?? "NORMAL";

    // Security cameras share the detect/lockdown path above but never move —
    // they only turn their FOV. Hand off to the camera-only behavior and skip
    // the movement loop entirely.
    if (enforcer.kind === "SECURITY_CAMERA") {
      this.tickCamera(state, enforcer, level);
      return;
    }

    // Per-turn patrol bookkeeping (pause countdown, idle scan) runs once,
    // before the per-step movement loop, so a dwell decrements once per turn
    // regardless of stepsPerTurn. Returns true when the turn was spent
    // pausing/scanning in place — skip the movement loop entirely.
    if (level === "NORMAL" && this.stepPatrolTurn(state, enforcer)) return;

    const steps = Math.max(1, enforcer.stepsPerTurn ?? 1);
    for (let i = 0; i < steps; i++) {
      if (state.detained) return;
      switch (level) {
        case "NORMAL":
          this.stepPatrol(state, enforcer);
          break;
        case "CAUTION":
          this.stepInvestigate(state, enforcer);
          break;
        case "ALERT":
          this.stepChase(state, enforcer);
          break;
        case "EVASION":
          this.stepCooldown(state, enforcer);
          return;
      }
    }
  }

  private enforcerSeesPlayer(state: WorldState, enforcer: Entity): boolean {
    if (state.player.roomId !== enforcer.roomId) return false;
    // Hidden in a locker: enforcers may walk past and not perceive the player.
    if (state.player.hidingTileKey) return false;
    const room = state.rooms.get(enforcer.roomId);
    if (!room) return false;
    // Proximity bubble: close enough that the enforcer notices regardless of
    // facing direction or lighting (footsteps, peripheral movement, etc).
    const dx = state.player.pos.x - enforcer.pos.x;
    const dy = state.player.pos.y - enforcer.pos.y;
    if (dx * dx + dy * dy <= ENFORCER_PROXIMITY_RADIUS * ENFORCER_PROXIMITY_RADIUS) return true;
    const visible = this.visibleTiles(state, enforcer);
    return visible.has(`${state.player.pos.x},${state.player.pos.y}`);
  }

  /** Whether `enforcer` should halt a YELLOW player it can currently see. Shared
   *  by the per-turn tick and the on-move scan so the conditions can't drift. */
  private canInterrogate(state: WorldState, enforcer: Entity, sees: boolean): boolean {
    return (
      enforcer.kind === "ENFORCER" &&
      sees &&
      state.player.compliance === "YELLOW" &&
      !interrogationSession.isActive() &&
      (enforcer.alert?.interrogateCooldown ?? 0) === 0
    );
  }

  /** Scan active enforcers for a YELLOW-sighting interrogation trigger. Called
   *  after the player moves so the shakedown fires the instant they step into
   *  a enforcer's range, rather than waiting for an explicit END TURN. Does NOT
   *  advance enforcer AI — sighting only. */
  maybeInterrogateOnMove(state: WorldState): void {
    if (state.detained || debugFlags.disableEnforcerAI) return;
    if (interrogationSession.isActive() || state.player.compliance !== "YELLOW") return;
    for (const enforcer of state.entities.values()) {
      if (enforcer.status !== "ACTIVE" || enforcer.kind !== "ENFORCER") continue;
      if (this.canInterrogate(state, enforcer, this.enforcerSeesPlayer(state, enforcer))) {
        interrogationSession.start(state, enforcer.id);
        return;
      }
    }
  }

  /** Seal every doorway in the player's current room and start the vacuum
   *  countdown. Mirrors the closure to each back-doorway so enforcers on the
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
    if (ambient === "LIT") return ENFORCER_BASE_RANGE + 1;
    if (ambient === "DARK") return Math.max(2, ENFORCER_BASE_RANGE - 3);
    return ENFORCER_BASE_RANGE;
  }

  /** Once-per-turn patrol bookkeeping. Returns true if the turn was consumed in
   *  place (paused at a node, or idle-scanning a no-route enforcer), in which case
   *  the caller skips the per-step movement loop. */
  private stepPatrolTurn(state: WorldState, enforcer: Entity): boolean {
    // Displaced by a prior chase — let the movement loop walk it home via
    // pursueViaPath. Abandon any dwell carried over from before the chase so a
    // stale countdown can't strand the enforcer (stepPatrol early-returns while
    // paused). The route resumes from patrolIndex once it's home.
    if (enforcer.homeRoomId && enforcer.roomId !== enforcer.homeRoomId) {
      if ((enforcer.patrolPauseRemaining ?? 0) > 0) enforcer.patrolPauseRemaining = 0;
      return false;
    }

    const route = enforcer.patrol;
    if (!route || route.length === 0) {
      this.stepIdleScan(state, enforcer);
      return true;
    }

    // Dwelling at the current node: count down once per turn, sweeping the FOV
    // so a YELLOW/RED player can wander into a fresh facing. When the dwell
    // expires, advance to the next node so next turn the enforcer departs.
    if ((enforcer.patrolPauseRemaining ?? 0) > 0) {
      enforcer.patrolPauseRemaining = (enforcer.patrolPauseRemaining ?? 0) - 1;
      this.rotateScan(enforcer);
      if (enforcer.patrolPauseRemaining === 0) {
        this.advancePatrolIndex(enforcer, route.length);
      }
      return true;
    }

    return false;
  }

  private stepPatrol(state: WorldState, enforcer: Entity): void {
    // A dwelling enforcer never moves — leftover step-loop iterations after an
    // arrival are no-ops (the countdown is handled once/turn in stepPatrolTurn).
    if ((enforcer.patrolPauseRemaining ?? 0) > 0) return;

    // If a chase displaced this enforcer out of its home room, walk back before
    // resuming patrol. patrolIndex is preserved so the route resumes mid-cycle
    // rather than restarting at node 0.
    if (enforcer.homeRoomId && enforcer.roomId !== enforcer.homeRoomId) {
      this.pursueViaPath(state, enforcer, enforcer.homeRoomId);
      return;
    }
    const route = enforcer.patrol;
    if (!route || route.length === 0) return;
    const idx = (enforcer.patrolIndex ?? 0) % route.length;
    const node = route[idx];
    const wp = node.pos;
    if (enforcer.pos.x === wp.x && enforcer.pos.y === wp.y) {
      if (node.faceOnArrival && enforcer.facing !== node.faceOnArrival) {
        enforcer.facing = node.faceOnArrival;
        eventBus.emit("ENTITY_FACING_CHANGED", { entityId: enforcer.id, facing: enforcer.facing });
      }
      // Authored dwell: hold here for N turns (consumed by stepPatrolTurn)
      // before advancing. Otherwise move on immediately.
      if ((node.pause ?? 0) > 0) {
        enforcer.patrolPauseRemaining = node.pause;
        return;
      }
      this.advancePatrolIndex(enforcer, route.length);
      return;
    }
    this.advanceToward(state, enforcer, wp);
  }

  /** Advance patrolIndex per the route's traversal mode. "loop" cycles
   *  start→end→start; "pingpong" reverses at each end (tracked in patrolDir). */
  private advancePatrolIndex(enforcer: Entity, len: number): void {
    if (len <= 1) {
      enforcer.patrolIndex = 0;
      return;
    }
    const idx = enforcer.patrolIndex ?? 0;
    if ((enforcer.patrolMode ?? "loop") === "pingpong") {
      let dir = enforcer.patrolDir ?? 1;
      let next = idx + dir;
      if (next >= len) {
        dir = -1;
        next = len - 2;
      } else if (next < 0) {
        dir = 1;
        next = 1;
      }
      enforcer.patrolDir = dir;
      enforcer.patrolIndex = next;
    } else {
      enforcer.patrolIndex = (idx + 1) % len;
    }
  }

  /** No-route enforcer idle behavior: a slow FOV sweep on a fixed cadence so it
   *  scans the room without spinning a quarter-turn every tick. */
  private stepIdleScan(state: WorldState, enforcer: Entity): void {
    if (state.turn % IDLE_SCAN_PERIOD === 0) {
      this.rotateScan(enforcer);
    }
  }

  /** Step toward (or cross) the first-hop doorway leading to `targetRoomId`.
   *  No-ops if all doorways in the current room are closed (lockdown case)
   *  or if the target is unreachable through the open room graph. */
  private pursueViaPath(state: WorldState, enforcer: Entity, targetRoomId: RoomId): void {
    const path = roomGraph.bfsPath(state, enforcer.roomId, targetRoomId);
    const hop = path?.[0];
    if (!hop) return;
    if (enforcer.pos.x === hop.localPos.x && enforcer.pos.y === hop.localPos.y) {
      const from = enforcer.pos;
      const fromRoomId = enforcer.roomId;
      enforcer.roomId = hop.to;
      enforcer.pos = { ...hop.landingPos };
      enforcer.lastMoveTurn = state.turn;
      eventBus.emit("ENTITY_MOVED", {
        entityId: enforcer.id,
        roomId: fromRoomId,
        from,
        to: enforcer.pos,
      });
      return;
    }
    this.advanceToward(state, enforcer, hop.localPos);
  }

  private stepInvestigate(state: WorldState, enforcer: Entity): void {
    const target = enforcer.alert?.lastStimulus;
    if (!target) return;
    if (enforcer.alert?.lastStimulusRoom && enforcer.alert.lastStimulusRoom !== enforcer.roomId) {
      // Stimulus came from another room — orient toward the doorway that leads
      // there (if any) but don't cross.
      const room = state.rooms.get(enforcer.roomId);
      if (!room) return;
      const door = room.doorways.find((d) => d.to === enforcer.alert?.lastStimulusRoom);
      if (door) {
        this.advanceToward(state, enforcer, door.localPos);
      }
      return;
    }
    this.advanceToward(state, enforcer, target);
  }

  private stepChase(state: WorldState, enforcer: Entity): void {
    const targetRoomId = enforcer.alert?.lastStimulusRoom ?? state.player.roomId;

    if (enforcer.roomId !== targetRoomId) {
      // Different room from the last sighting — pursue through open doorways.
      // The lose-of-sight timer in AlertFSM decides when to give up.
      this.pursueViaPath(state, enforcer, targetRoomId);
      return;
    }

    // Same room as the last sighting. If the player is here, chase them
    // directly; otherwise chase the stale lastStimulus tile until the FSM
    // gives up.
    const dest = state.player.roomId === enforcer.roomId
      ? state.player.pos
      : (enforcer.alert?.lastStimulus ?? state.player.pos);
    this.advanceToward(state, enforcer, dest);

    if (state.player.roomId !== enforcer.roomId) return;
    if (enforcer.pos.x === state.player.pos.x && enforcer.pos.y === state.player.pos.y) {
      // Surveillance drones can't apprehend the player — reaching the player's
      // tile only flags detection. Detention in the duct comes solely from the
      // suffocation timer (WorldEngine.advanceTurn).
      if (enforcer.kind === "ENFORCER") {
        state.detained = true;
        eventBus.emit("PLAYER_DETAINED", { enforcerId: enforcer.id, turn: state.turn });
      } else {
        state.detected = true;
        eventBus.emit("PLAYER_DETECTED", { enforcerId: enforcer.id, pos: enforcer.pos });
      }
    } else {
      state.detected = true;
      eventBus.emit("PLAYER_DETECTED", { enforcerId: enforcer.id, pos: enforcer.pos });
    }
  }

  private stepCooldown(_state: WorldState, enforcer: Entity): void {
    // Rotate to scan: cycle through cardinal facings.
    this.rotateScan(enforcer);
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
          eventBus.emit("PLAYER_DETECTED", { enforcerId: cam.id, pos: cam.pos });
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

  private advanceToward(state: WorldState, enforcer: Entity, target: Vec2): void {
    const room = state.rooms.get(enforcer.roomId);
    if (!room) return;
    const dx = Math.sign(target.x - enforcer.pos.x);
    const dy = Math.sign(target.y - enforcer.pos.y);
    if (dx === 0 && dy === 0) return;
    const next: Vec2 =
      Math.abs(target.x - enforcer.pos.x) >= Math.abs(target.y - enforcer.pos.y)
        ? { x: enforcer.pos.x + dx, y: enforcer.pos.y }
        : { x: enforcer.pos.x, y: enforcer.pos.y + dy };
    if (!this.canEnter(room.tiles, room.width, room.height, next)) return;
    const facing = facingFromDelta(next.x - enforcer.pos.x, next.y - enforcer.pos.y);
    if (facing && facing !== enforcer.facing) {
      enforcer.facing = facing;
      eventBus.emit("ENTITY_FACING_CHANGED", { entityId: enforcer.id, facing });
    }
    const from = enforcer.pos;
    enforcer.pos = next;
    enforcer.lastMoveTurn = state.turn;
    eventBus.emit("ENTITY_MOVED", { entityId: enforcer.id, roomId: enforcer.roomId, from, to: next });
    // Audio-only signal — does NOT route through SoundField (would let the
    // player exploit enforcer noise as a sonar ping into the alert FSM).
    eventBus.emit("ENFORCER_FOOTSTEP", { enforcerId: enforcer.id, roomId: enforcer.roomId, pos: next });
  }

  private canEnter(tiles: Tile[], w: number, h: number, p: Vec2): boolean {
    if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) return false;
    const tile = tiles[p.y * w + p.x];
    return !!tile && !tile.solid;
  }
}

export const enforcerSystem = new EnforcerSystem();
