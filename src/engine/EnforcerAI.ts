// EnforcerAI — patrol + alert + chase. Stripped to the essentials for the
// slice: enforcers patrol a list of waypoints; if they see the player and the
// player has any active violation on the same floor, they chase.

import type { Entity, Vec3, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";

interface Waypoint extends Vec3 {}

interface PatrolMemory {
  waypoints: Waypoint[];
  index: number;
}

const SIGHT_RADIUS = 5;

class EnforcerAI {
  private memory = new Map<string, PatrolMemory>();

  reset(): void {
    this.memory.clear();
  }

  registerPatrol(entityId: string, waypoints: Waypoint[]): void {
    this.memory.set(entityId, { waypoints, index: 0 });
  }

  tick(state: WorldState): void {
    for (const entity of state.entities.values()) {
      if (entity.kind !== "ENFORCER" || entity.status !== "ACTIVE") continue;
      this.stepEnforcer(state, entity);
    }
  }

  private stepEnforcer(state: WorldState, entity: Entity): void {
    const mem = this.memory.get(entity.id);
    if (!mem || mem.waypoints.length === 0) return;

    const playerPos = state.player.pos;
    const sees =
      playerPos.z === entity.pos.z &&
      Math.hypot(playerPos.x - entity.pos.x, playerPos.y - entity.pos.y) <= SIGHT_RADIUS;
    const hasViolation = state.violations.length > 0;

    if (sees && hasViolation) {
      // Chase: take a single step toward the player.
      const dx = Math.sign(playerPos.x - entity.pos.x);
      const dy = Math.sign(playerPos.y - entity.pos.y);
      const target: Vec3 = Math.abs(playerPos.x - entity.pos.x) >= Math.abs(playerPos.y - entity.pos.y)
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

    // Idle patrol: step one tile toward current waypoint; advance when reached.
    const wp = mem.waypoints[mem.index];
    if (entity.pos.x === wp.x && entity.pos.y === wp.y) {
      mem.index = (mem.index + 1) % mem.waypoints.length;
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
    entity.pos = to;
    eventBus.emit("ENTITY_MOVED", { entityId: entity.id, from, to });
  }
}

export const enforcerAI = new EnforcerAI();
