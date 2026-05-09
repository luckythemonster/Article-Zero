// AlertSystem — owns the per-enforcer alert ladder (NORMAL → CAUTION → ALERT
// → EVASION) and the floor-wide state.alertLevel readout the HUD reads.
//
// Per-entity perception lives on entity.alert. The system is otherwise
// stateless, mirroring EnforcerAI's design (see EnforcerAI.reset comment).

import type {
  AlertLevel,
  Entity,
  Vec3,
  WorldState,
} from "../types/world.types";
import { eventBus } from "./EventBus";

const TIMER_DEFAULTS: Record<AlertLevel, number> = {
  NORMAL: 0,
  CAUTION: 6,
  ALERT: 8,
  EVASION: 5,
};

const LEVEL_RANK: Record<AlertLevel, number> = {
  NORMAL: 0,
  CAUTION: 1,
  EVASION: 2,
  ALERT: 3,
};

function maxLevel(a: AlertLevel, b: AlertLevel): AlertLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

class AlertSystem {
  reset(): void {
    // Per-entity state lives on Entity.alert; floor max lives on WorldState.
  }

  /** Move a single enforcer to a new alert level, set its timer, and emit.
   *  Caller decides the level — this fn just commits the transition. */
  transition(
    state: WorldState,
    entity: Entity,
    next: AlertLevel,
    target?: Vec3,
  ): void {
    const prev = entity.alert?.level ?? "NORMAL";
    if (prev === next && entity.alert?.investigationTarget === target) {
      // Refresh timer on re-trigger so a continuous noise/sight keeps the
      // enforcer engaged.
      if (entity.alert) entity.alert.timer = TIMER_DEFAULTS[next];
      return;
    }
    entity.alert = {
      level: next,
      timer: TIMER_DEFAULTS[next],
      investigationTarget: target ?? entity.alert?.investigationTarget,
    };
    const floorMax = this.recomputeFloorMax(state);
    eventBus.emit("ALERT_LEVEL_CHANGED", {
      entityId: entity.id,
      previous: prev,
      current: next,
      floorMax,
    });
  }

  /** Spotter-confirmed sighting. Other enforcers on the floor escalate to
   *  CAUTION (with the spotter's tile as their target) — only the spotter is
   *  at full ALERT. Mirrors MGS chatter where one guard calls in others. */
  raiseAlert(state: WorldState, spotter: Entity, target: Vec3): void {
    state.lastSeenPos = { ...target };
    this.transition(state, spotter, "ALERT", target);
    for (const other of state.entities.values()) {
      if (other.id === spotter.id) continue;
      if (other.kind !== "ENFORCER") continue;
      if (other.status !== "ACTIVE") continue;
      if (other.pos.z !== spotter.pos.z) continue;
      const cur = other.alert?.level ?? "NORMAL";
      if (LEVEL_RANK[cur] < LEVEL_RANK.CAUTION) {
        this.transition(state, other, "CAUTION", target);
      }
    }
  }

  /** Decay every active alert by one tick. Called from endTurn after
   *  EnforcerAI / CameraAI have had their say. */
  tick(state: WorldState): void {
    for (const entity of state.entities.values()) {
      if (entity.kind !== "ENFORCER" && entity.kind !== "CAMERA") continue;
      const a = entity.alert;
      if (!a || a.level === "NORMAL") continue;
      a.timer -= 1;
      if (a.timer > 0) continue;
      const next = this.decayStep(a.level);
      if (next === "NORMAL") {
        entity.alert = undefined;
        eventBus.emit("ALERT_LEVEL_CHANGED", {
          entityId: entity.id,
          previous: a.level,
          current: "NORMAL",
          floorMax: "NORMAL", // recomputed below
        });
      } else {
        entity.alert = {
          level: next,
          timer: TIMER_DEFAULTS[next],
          investigationTarget: a.investigationTarget,
        };
        eventBus.emit("ALERT_LEVEL_CHANGED", {
          entityId: entity.id,
          previous: a.level,
          current: next,
          floorMax: "NORMAL",
        });
      }
    }
    state.alertLevel = this.recomputeFloorMax(state);
    // Keep state.detected as a derived alias for older code paths and the
    // existing HUD line until they migrate to state.alertLevel.
    state.detected = state.alertLevel === "ALERT";
  }

  private decayStep(from: AlertLevel): AlertLevel {
    if (from === "ALERT") return "EVASION";
    if (from === "EVASION") return "CAUTION";
    return "NORMAL";
  }

  recomputeFloorMax(state: WorldState): AlertLevel {
    let max: AlertLevel = "NORMAL";
    for (const e of state.entities.values()) {
      if (!e.alert) continue;
      max = maxLevel(max, e.alert.level);
    }
    state.alertLevel = max;
    state.detected = max === "ALERT";
    return max;
  }
}

export const alertSystem = new AlertSystem();
