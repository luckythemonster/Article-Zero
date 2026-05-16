// Active while the player is concealed inside a locker. Refuses move/knock/
// peek; only interact (to exit) and endTurn are legal. Motion is blocked.

import type {
  PlayerActionId,
  PlayerMotionResult,
  PlayerStateName,
  WorldState,
} from "../../types/world.types";
import { PlayerStateBase } from "./PlayerStateBase";

export class HidingState extends PlayerStateBase {
  readonly name: PlayerStateName = "HIDING";

  canPerform(_state: WorldState, action: PlayerActionId): boolean {
    if (action === "move") return false;
    if (action === "knock") return false;
    if (action === "peek") return false;
    return true;
  }

  motion(_state: WorldState, _dx: number, _dy: number): PlayerMotionResult {
    return { kind: "BLOCKED" };
  }
}
