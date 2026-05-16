// Quiet stance. Reduced speed; emits no walk-sound (handled by the sound
// field path that reads stance directly). Full action set otherwise.

import type {
  PlayerMotionResult,
  PlayerStateName,
  WorldState,
} from "../../types/world.types";
import { PLAYER_CREEP_SPEED } from "../PhysicsConfig";
import { PlayerStateBase } from "./PlayerStateBase";

export class CreepState extends PlayerStateBase {
  readonly name: PlayerStateName = "CREEP";

  enter(state: WorldState): void {
    if (state.player.stance !== "CREEP") state.player.stance = "CREEP";
  }

  motion(_state: WorldState, dx: number, dy: number): PlayerMotionResult {
    if (dx === 0 && dy === 0) return { kind: "VELOCITY", vx: 0, vy: 0 };
    return {
      kind: "VELOCITY",
      vx: dx * PLAYER_CREEP_SPEED,
      vy: dy * PLAYER_CREEP_SPEED,
    };
  }
}
