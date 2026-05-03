// EnforcerAI — patrol + alert + chase. Stripped to the essentials for the
// slice: enforcers walk a patrol route stored on the entity itself; if they
// see the player and the player has an active violation on the same floor,
// they chase. With stepsPerTurn>1 (Era 1 default), the entire decide-and-step
// cycle runs that many times per world tick, so a 2-tile enforcer can both
// notice the spill and close on it inside a single turn.
//
// Light Spill (lore/MASTER.md, mechanics blueprint §1): when
// state.alignmentLightActive is true, the alignment terminal radiates a
// 3-tile cone. We model that as: any enforcer with line-of-sight to the
// player within SPILL_RADIUS breaks patrol toward the player. The player
// can spend 1 AP on [Kill Screen] to clear the flag and hide the spill.

import type { Entity, Facing, Vec3, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";

const SIGHT_RADIUS = 5;
const SPILL_RADIUS = 3;

function facingFromDelta(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}

function hasLineOfSight(state: WorldState, from: Vec3, to: Vec3): boolean {
  if (from.z !== to.z) return false;
  const floor = state.floors.get(from.z);
  if (!floor) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return true;
  for (let i = 1; i < steps; i++) {
    const x = Math.round(from.x + (dx * i) / steps);
    const y = Math.round(from.y + (dy * i) / steps);
    if (x < 0 || y < 0 || x >= floor.width || y >= floor.height) return false;
    const tile = floor.tiles[y * floor.width + x];
    if (tile && tile.opaque) return false;
  }
  return true;
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
    const sees =
      playerPos.z === entity.pos.z &&
      Math.hypot(playerPos.x - entity.pos.x, playerPos.y - entity.pos.y) <= SIGHT_RADIUS;
    const hasViolation = state.violations.length > 0;
    const runaway = state.player.runaway === true;
    const spillVisible =
      state.alignmentLightActive &&
      playerPos.z === entity.pos.z &&
      Math.hypot(playerPos.x - entity.pos.x, playerPos.y - entity.pos.y) <= SPILL_RADIUS &&
      hasLineOfSight(state, entity.pos, playerPos);

    if (sees && (hasViolation || runaway)) {
      this.advanceToward(state, entity, playerPos);
      if (entity.pos.x === playerPos.x && entity.pos.y === playerPos.y) {
        state.detained = true;
        eventBus.emit("PLAYER_DETAINED", { enforcerId: entity.id, turn: state.turn });
      } else {
        state.detected = true;
        eventBus.emit("PLAYER_DETECTED", { enforcerId: entity.id, pos: entity.pos });
      }
      return;
    }

    if (spillVisible) {
      // Break patrol and investigate the terminal light. Doesn't trigger
      // detention by itself; if the enforcer reaches the player tile they'll
      // detect on the next tick via the sees+violation branch above.
      eventBus.emit("ENFORCER_INVESTIGATING", {
        enforcerId: entity.id,
        reason: "LIGHT_SPILL",
      });
      this.advanceToward(state, entity, playerPos);
      return;
    }

    // Idle patrol: step one tile toward the current waypoint; advance when reached.
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
