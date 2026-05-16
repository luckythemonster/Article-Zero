// Default upright player state. Full action set; baseline walking speed.

import type {
  PlayerStateName,
  WorldState,
} from "../../types/world.types";
import { PlayerStateBase } from "./PlayerStateBase";

export class WalkState extends PlayerStateBase {
  readonly name: PlayerStateName = "WALK";

  enter(state: WorldState): void {
    if (state.player.stance !== "WALK") state.player.stance = "WALK";
  }
}
