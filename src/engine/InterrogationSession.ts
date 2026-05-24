// InterrogationSession — a checkpoint shakedown an Enforcer runs when it sights
// a YELLOW-compliance player. Mirrors AlignmentSession's three-stage shape: the
// dialogue flows through the GuardInterrogationModal UI, which drives advance()
// /complete() so qScore and compliance stay consistent with the engine.
//
// Pass: the player talks their way out — qScore is untouched (stays YELLOW) and
//   the interrogating guard gets a cooldown so it won't immediately re-stop them.
// Fail: qScore is bumped, compliance recomputes to RED, and the next guard tick
//   sees a RED player and springs the existing lockdown + chase (GuardSystem).

import type { EntityId, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";
import { complianceSystem } from "./ComplianceSystem";

export type InterrogationStage = "INTAKE" | "DECOMP" | "CORRECTION";

/** Turns the interrogating guard waits before it may stop a still-YELLOW
 *  player again. Long enough to walk out of the room, short enough that
 *  loitering invites a second shakedown. */
export const INTERROGATE_COOLDOWN = 6;

interface ActiveSession {
  guardId: EntityId;
  stage: InterrogationStage;
  startedTurn: number;
}

class InterrogationSession {
  private active: ActiveSession | null = null;

  isActive(): boolean {
    return this.active !== null;
  }
  current(): ActiveSession | null {
    return this.active;
  }

  start(state: WorldState, guardId: EntityId): void {
    this.active = { guardId, stage: "INTAKE", startedTurn: state.turn };
    eventBus.emit("INTERROGATION_SESSION_START", { guardId, stage: "INTAKE" });
  }

  advance(state: WorldState): void {
    if (!this.active) return;
    const { guardId, stage } = this.active;
    const next: InterrogationStage | null =
      stage === "INTAKE" ? "DECOMP" : stage === "DECOMP" ? "CORRECTION" : null;
    if (next === null) {
      this.complete(state, true);
      return;
    }
    this.active = { ...this.active, stage: next };
    eventBus.emit("INTERROGATION_SESSION_START", { guardId, stage: next });
  }

  complete(state: WorldState, success: boolean): void {
    if (!this.active) return;
    const guardId = this.active.guardId;

    if (success) {
      // Cleared the checkpoint: keep qScore (still YELLOW) but give this guard
      // a cooldown so it doesn't re-stop the player on the very next tick. The
      // trigger returns before alertFSM.step runs, so alert may be uninitialised
      // here — seed it the same way AlertFSM does.
      const guard = state.entities.get(guardId);
      if (guard) {
        guard.alert ??= { level: "NORMAL", enteredTurn: state.turn };
        guard.alert.interrogateCooldown = INTERROGATE_COOLDOWN;
      }
    } else {
      // Blew the cover: bump qScore. The compliance recompute below flips the
      // tier to RED; the next guard tick handles lockdown + chase via the
      // existing seesAsAlert path.
      const previous = state.player.qScore;
      state.player.qScore = previous + 1;
      eventBus.emit("Q_SCORE_CHANGED", { previous, current: state.player.qScore });
    }

    eventBus.emit("INTERROGATION_SESSION_COMPLETE", { guardId, success });
    this.active = null;
    complianceSystem.recompute(state);
  }

  reset(): void {
    this.active = null;
  }
}

export const interrogationSession = new InterrogationSession();
