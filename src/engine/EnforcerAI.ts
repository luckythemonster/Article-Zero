// EnforcerAI — patrol + alert + chase. Stripped to the essentials for the
// slice: enforcers walk a patrol route stored on the entity itself; if they
// see the player and the player has an active violation on the same floor,
// they chase.

import type { Entity, Facing, Vec3, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";

const SIGHT_RADIUS = 5;

function facingFromDelta(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}

class EnforcerAI {
  reset(): void {
    // No internal state — patrol progress lives on the entity.
  }

  tick(state: WorldState): void {
    for (const entity of state.entities.values()) {
      if (entity.kind !== "ENFORCER" || entity.status !== "ACTIVE") continue;
      this.stepEnforcer(state, entity);
    }
  }

  private stepEnforcer(state: WorldState, entity: Entity): void {
    const playerPos = state.player.pos;
    const sees =
      playerPos.z === entity.pos.z &&
      Math.hypot(playerPos.x - entity.pos.x, playerPos.y - entity.pos.y) <= SIGHT_RADIUS;
    const hasViolation = state.violations.length > 0;
    const runaway = state.player.runaway === true;

    if (sees && (hasViolation || runaway)) {
      const dx = Math.sign(playerPos.x - entity.pos.x);
      const dy = Math.sign(playerPos.y - entity.pos.y);
      const target: Vec3 = Math.abs(playerPos.x - entity.pos.x) >=
        Math.abs(playerPos.y - entity.pos.y)
        ? { x: entity.pos.x + dx, y: entity.pos.y, z: entity.pos.z }
        : { x: entity.pos.x, y: entity.pos.y + dy, z: entity.pos.z };
      this.tryMove(state, entity, target);
      if (entity.pos.x === playerPos.x && entity.pos.y === playerPos.y) {
        state.detained = true;
        eventBus.emit("PLAYER_DETAINED", { enforcerId: entity.id, turn: state.turn });
      } else {
        state.detected = true;
        eventBus.emit("PLAYER_DETECTED", { enforcerId: entity.id, pos: entity.pos });
      }
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
    const dx = Math.sign(wp.x - entity.pos.x);
    const dy = Math.sign(wp.y - entity.pos.y);
    const target: Vec3 = Math.abs(wp.x - entity.pos.x) >= Math.abs(wp.y - entity.pos.y)
      ? { x: entity.pos.x + dx, y: entity.pos.y, z: entity.pos.z }
      : { x: entity.pos.x, y: entity.pos.y + dy, z: entity.pos.z };
    this.tryMove(state, entity, target);
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
