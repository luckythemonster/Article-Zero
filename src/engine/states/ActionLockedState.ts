// ActionLockedState — high action-commitment lock.
//
// Triggered when the player commits to a consequential, timed action
// (terminal use, vent crawl). For the duration of state.player.actionLock,
// movement input is refused and most verbs are gated. A progress bar is
// emitted to React via ACTION_PROGRESS, mirroring EXTRACTION_PROGRESS.
//
// The lock is entered by WorldEngineActions setting state.player.actionLock;
// PlayerStateMachine.resolveTargetState routes here while the lock is live;
// this state's update() advances elapsed and the resolver transitions back
// to WALK/SNEAK once elapsed >= duration.

import type {
  PlayerActionId,
  PlayerMotionResult,
  PlayerStateName,
  WorldState,
} from "../../types/world.types";
import { eventBus } from "../EventBus";
import { PlayerStateBase } from "./PlayerStateBase";

export class ActionLockedState extends PlayerStateBase {
  readonly name: PlayerStateName = "ACTION_LOCKED";

  enter(state: WorldState): void {
    const lock = state.player.actionLock;
    if (!lock) return;
    eventBus.emit("ACTION_PROGRESS", {
      actionId: lock.actionId,
      progress: 0,
      duration: lock.duration,
    });
  }

  exit(_state: WorldState): void {
    // Lock is cleared by the resolver after the duration elapses. If we exit
    // for another reason (e.g. detained), leave the lock present — the
    // resolver will re-route us back next frame unless it's also cleared.
  }

  update(state: WorldState, dt: number): void {
    const lock = state.player.actionLock;
    if (!lock) return;
    lock.elapsed = Math.min(lock.duration, lock.elapsed + dt);
    eventBus.emit("ACTION_PROGRESS", {
      actionId: lock.actionId,
      progress: lock.elapsed / lock.duration,
      duration: lock.duration,
    });
  }

  /** All verbs refused except endTurn (turn cadence is still allowed so the
   *  game doesn't stall while the lock plays out in the turn-based fallback). */
  canPerform(_state: WorldState, action: PlayerActionId): boolean {
    return action === "endTurn";
  }

  /** Movement always blocked while the lock is active. */
  motion(_state: WorldState, _dx: number, _dy: number): PlayerMotionResult {
    return { kind: "BLOCKED" };
  }
}
