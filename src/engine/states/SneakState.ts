// Sneak stance. Half speed (PLAYER_SNEAK_SPEED), zero noise — the footstep
// path in WorldEngine.setPlayerTilePos / actions.sneak emits intensity 0,
// keeping the player below CAUTION_SOUND_THRESHOLD. Full action set otherwise.
//
// Renamed from CreepState — same semantics, real-time-stealth naming.

import type {
  PlayerMotionResult,
  PlayerStateName,
  WorldState,
} from "../../types/world.types";
import { PLAYER_SNEAK_SPEED } from "../PhysicsConfig";
import { PlayerStateBase } from "./PlayerStateBase";

export class SneakState extends PlayerStateBase {
  readonly name: PlayerStateName = "SNEAK";

  enter(state: WorldState): void {
    if (state.player.stance !== "SNEAK") state.player.stance = "SNEAK";
  }

  motion(_state: WorldState, dx: number, dy: number): PlayerMotionResult {
    if (dx === 0 && dy === 0) return { kind: "VELOCITY", vx: 0, vy: 0 };
    return {
      kind: "VELOCITY",
      vx: dx * PLAYER_SNEAK_SPEED,
      vy: dy * PLAYER_SNEAK_SPEED,
    };
  }
}
