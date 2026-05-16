// Active while the player is inside a `crawlspace: true` Room (the vent
// network). Movement is sneak-quiet; knocking is refused.

import type {
  PlayerActionId,
  PlayerMotionResult,
  PlayerStateName,
  WorldState,
} from "../../types/world.types";
import { PLAYER_SNEAK_SPEED } from "../PhysicsConfig";
import { PlayerStateBase } from "./PlayerStateBase";

export class DuctCrawlState extends PlayerStateBase {
  readonly name: PlayerStateName = "DUCT_CRAWL";

  canPerform(_state: WorldState, action: PlayerActionId): boolean {
    if (action === "knock") return false;
    return true;
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
