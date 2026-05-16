// Abstract base for player FSM states. Modeled on AlertFSM's per-guard
// state pattern: enter/exit hooks, per-frame update, action gating, and a
// motion() resolver consumed by PlayerPhysicsBridge.

import type {
  PlayerActionId,
  PlayerMotionResult,
  PlayerStateName,
  WorldState,
} from "../../types/world.types";
import { PLAYER_BASE_SPEED } from "../PhysicsConfig";

export abstract class PlayerStateBase {
  abstract readonly name: PlayerStateName;

  /** Fired once when the FSM transitions into this state. */
  enter(_state: WorldState): void {}

  /** Fired once when the FSM transitions out of this state. */
  exit(_state: WorldState): void {}

  /** Called every frame from RoomScene.update. Default no-op. */
  update(_state: WorldState, _dt: number): void {}

  /** Asked by WorldEngineActions to gate an AP action. Default: allow. */
  canPerform(_state: WorldState, _action: PlayerActionId): boolean {
    return true;
  }

  /** Asked by PlayerPhysicsBridge per frame. Default: baseline walk velocity. */
  motion(_state: WorldState, dx: number, dy: number): PlayerMotionResult {
    if (dx === 0 && dy === 0) return { kind: "VELOCITY", vx: 0, vy: 0 };
    return {
      kind: "VELOCITY",
      vx: dx * PLAYER_BASE_SPEED,
      vy: dy * PLAYER_BASE_SPEED,
    };
  }
}
