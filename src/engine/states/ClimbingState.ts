// Active when the player stands on a STAIRS or LADDER tile and an adjacent
// cell carries a different elevation. Knock is refused (no walls to knock
// against on a stair landing). Motion still flows through the base velocity,
// but the physics bridge consults the tile's `direction` to scale magnitude:
//   - velocity aligned with stair direction → STAIRS_UP_FACTOR (slow)
//   - velocity opposed to stair direction → STAIRS_DOWN_FACTOR (fast)
//   - perpendicular → unchanged
// The scaling itself lives in PlayerPhysicsBridge so it can be applied
// regardless of which state issued the motion (e.g. SNEAK up a stair).

import type {
  PlayerActionId,
  PlayerStateName,
  WorldState,
} from "../../types/world.types";
import { PlayerStateBase } from "./PlayerStateBase";

export class ClimbingState extends PlayerStateBase {
  readonly name: PlayerStateName = "CLIMBING";

  canPerform(_state: WorldState, action: PlayerActionId): boolean {
    if (action === "knock") return false;
    return true;
  }
}
