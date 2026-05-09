// EnforcerAI — patrol + cone-based detection + alert ladder. Each enforcer
// holds its own perception state on entity.alert; the AlertSystem owns the
// transitions and the floor-wide readout. Decision order each step:
//   1. Vision cone + LOS + violation → ALERT, chase, detain on contact.
//   2. Audible noise → CAUTION toward the noise origin.
//   3. ALERT/EVASION fallthrough → search lastSeenPos.
//   4. Light spill (alignment terminal) → CAUTION investigate.
//   5. CAUTION investigation target → walk to it.
//   6. Patrol waypoints (NORMAL).
//
// Concealment: while state.concealedEntityId is set the player is invisible
// to vision cones. An enforcer who steps adjacent peeks and reveals.

import type { Entity, Facing, Vec3, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";
import { coneRangeFor, hasLineOfSight, isInVisionCone } from "./visionCone";
import { alertSystem } from "./AlertSystem";
import { noiseSystem } from "./NoiseSystem";

const SPILL_RADIUS = 3;

function facingFromDelta(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}

function manhattan(a: Vec3, b: Vec3): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

class EnforcerAI {
  reset(): void {
    // No internal state — patrol progress lives on the entity.
  }

  tick(state: WorldState): void {
    for (const entity of state.entities.values()) {
      if (entity.kind !== "ENFORCER" || entity.status !== "ACTIVE") continue;
      const steps = Math.max(1, entity.stepsPerTurn ?? 1);
      for (let i = 0; i < steps; i++) {
        if (state.detained) return;
        this.stepEnforcer(state, entity);
      }
    }
  }

  private stepEnforcer(state: WorldState, entity: Entity): void {
    const playerPos = state.player.pos;
    const sameFloor = playerPos.z === entity.pos.z;
    const floor = state.floors.get(entity.pos.z);
    const ambient = floor?.ambientLight ?? "DIM";

    // Concealment: an adjacent enforcer peeks and reveals the player.
    if (sameFloor && state.concealedEntityId && manhattan(entity.pos, playerPos) <= 1) {
      const id = state.concealedEntityId;
      state.concealedEntityId = undefined;
      eventBus.emit("PLAYER_REVEALED", { entityId: id, pos: playerPos });
    }
    const concealed = state.concealedEntityId != null;

    // 1. Vision-cone detection.
    const level = entity.alert?.level ?? "NORMAL";
    const range = entity.coneRange ?? coneRangeFor(level, ambient);
    const halfAngle = entity.coneHalfAngleDeg ?? 45;
    const sees = sameFloor
      && !concealed
      && isInVisionCone(entity.pos, entity.facing, playerPos, range, halfAngle)
      && hasLineOfSight(state, entity.pos, playerPos);
    const hasViolation = state.violations.length > 0;
    const runaway = state.player.runaway === true;

    if (sees && (hasViolation || runaway)) {
      alertSystem.raiseAlert(state, entity, playerPos);
      this.advanceToward(state, entity, playerPos);
      if (entity.pos.x === playerPos.x && entity.pos.y === playerPos.y) {
        state.detained = true;
        eventBus.emit("PLAYER_DETAINED", { enforcerId: entity.id, turn: state.turn });
      } else {
        eventBus.emit("PLAYER_DETECTED", { enforcerId: entity.id, pos: entity.pos });
      }
      return;
    }

    // If we sighted the player but they have no violation, still record the
    // tile so EVASION searching has something to chase if violations later
    // accrue. Doesn't escalate by itself.
    if (sees) {
      state.lastSeenPos = { ...playerPos };
    }

    // 2. Audible noise → CAUTION investigate. Skip if already ALERT (ALERT
    //    keeps chasing lastSeenPos until decay).
    if (level !== "ALERT") {
      const heard = noiseSystem.audibleAt(state, entity.pos);
      if (heard.length > 0) {
        const target = heard[0].pos;
        alertSystem.transition(state, entity, "CAUTION", target);
        eventBus.emit("ENFORCER_INVESTIGATING", {
          enforcerId: entity.id,
          reason: "NOISE",
          target,
        });
        this.advanceToward(state, entity, target);
        return;
      }
    }

    // 3. ALERT/EVASION search — keep moving toward last known position.
    if (level === "ALERT" || level === "EVASION") {
      const target = entity.alert?.investigationTarget ?? state.lastSeenPos;
      if (target) {
        this.advanceToward(state, entity, target);
        if (entity.pos.x === target.x && entity.pos.y === target.y) {
          // Reached search target with no contact: accelerate decay.
          if (entity.alert) entity.alert.timer = Math.max(0, entity.alert.timer - 2);
        }
        return;
      }
    }

    // 4. Light spill (legacy alignment-terminal mechanic). Now flows through
    //    CAUTION so it shares the alert ladder with everything else.
    const spillVisible =
      state.alignmentLightActive
      && sameFloor
      && Math.hypot(playerPos.x - entity.pos.x, playerPos.y - entity.pos.y) <= SPILL_RADIUS
      && hasLineOfSight(state, entity.pos, playerPos);
    if (spillVisible) {
      alertSystem.transition(state, entity, "CAUTION", playerPos);
      eventBus.emit("ENFORCER_INVESTIGATING", {
        enforcerId: entity.id,
        reason: "LIGHT_SPILL",
        target: playerPos,
      });
      this.advanceToward(state, entity, playerPos);
      return;
    }

    // 5. CAUTION investigation target (e.g. lingering from a prior noise).
    if (level === "CAUTION" && entity.alert?.investigationTarget) {
      this.advanceToward(state, entity, entity.alert.investigationTarget);
      return;
    }

    // 6. Idle patrol.
    const route = entity.patrol;
    if (!route || route.length === 0) return;
    const idx = entity.patrolIndex ?? 0;
    const wp = route[idx % route.length];
    if (entity.pos.x === wp.x && entity.pos.y === wp.y && entity.pos.z === wp.z) {
      entity.patrolIndex = (idx + 1) % route.length;
      return;
    }
    this.advanceToward(state, entity, wp);
  }

  private advanceToward(state: WorldState, entity: Entity, target: Vec3): void {
    const dx = Math.sign(target.x - entity.pos.x);
    const dy = Math.sign(target.y - entity.pos.y);
    if (dx === 0 && dy === 0) return;
    const next: Vec3 = Math.abs(target.x - entity.pos.x) >= Math.abs(target.y - entity.pos.y)
      ? { x: entity.pos.x + dx, y: entity.pos.y, z: entity.pos.z }
      : { x: entity.pos.x, y: entity.pos.y + dy, z: entity.pos.z };
    this.tryMove(state, entity, next);
  }

  private tryMove(state: WorldState, entity: Entity, to: Vec3): void {
    const floor = state.floors.get(to.z);
    if (!floor) return;
    if (to.x < 0 || to.y < 0 || to.x >= floor.width || to.y >= floor.height) return;
    const tile = floor.tiles[to.y * floor.width + to.x];
    if (!tile || tile.solid) return;
    const from = entity.pos;
    const facing = facingFromDelta(to.x - from.x, to.y - from.y);
    if (facing) entity.facing = facing;
    entity.pos = to;
    entity.lastMoveTurn = state.turn;
    eventBus.emit("ENTITY_MOVED", { entityId: entity.id, from, to });
  }
}

export const enforcerAI = new EnforcerAI();
