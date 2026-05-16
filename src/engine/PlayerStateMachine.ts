// PlayerStateMachine — singleton modeled on AlertFSM.
//
// One concrete PlayerStateBase is "current" at a time. The FSM is polled
// each frame from RoomScene.update() and inspects WorldState for the
// triggers that drive transitions:
//
//   *   → ACTION_LOCKED  when player.actionLock is set (highest priority)
//   *   → HIDING         when player.hidingTileKey is set
//   HIDING → WALK/SNEAK  when player.hidingTileKey clears
//   *   → DUCT_CRAWL     when player.roomId is a crawlspace room
//   DUCT_CRAWL → *       when player.roomId leaves crawlspace
//   WALK ↔ SNEAK         following player.stance
//   WALK/SNEAK → CLIMBING when standing on STAIRS/LADDER with an elevation neighbor
//   CLIMBING → WALK/SNEAK when no longer on STAIRS/LADDER
//
// Transitions emit PLAYER_STATE_CHANGED so the debug overlay and any future
// audio cue can subscribe. ACTION_LOCKED also emits ACTION_LOCK_STARTED on
// entry (via WorldEngineActions, the trigger source) and
// ACTION_LOCK_RELEASED when the resolver clears the lock.

import type {
  PlayerActionId,
  PlayerMotionResult,
  PlayerStateName,
  Tile,
  WorldState,
} from "../types/world.types";
import { eventBus } from "./EventBus";
import { PlayerStateBase } from "./states/PlayerStateBase";
import { WalkState } from "./states/WalkState";
import { SneakState } from "./states/SneakState";
import { HidingState } from "./states/HidingState";
import { DuctCrawlState } from "./states/DuctCrawlState";
import { ClimbingState } from "./states/ClimbingState";
import { ActionLockedState } from "./states/ActionLockedState";

class PlayerStateMachine {
  private current: PlayerStateBase = new WalkState();
  private states = {
    WALK: new WalkState(),
    SNEAK: new SneakState(),
    HIDING: new HidingState(),
    DUCT_CRAWL: new DuctCrawlState(),
    CLIMBING: new ClimbingState(),
    ACTION_LOCKED: new ActionLockedState(),
  } as const;

  init(state: WorldState): void {
    // Re-init (e.g., after loadSnapshot) needs to call exit on the prior
    // state so any state-owned bookkeeping winds down before re-enter.
    this.current.exit(state);
    this.current = this.resolveTargetState(state);
    this.current.enter(state);
  }

  /** Called every frame from RoomScene.update. Recomputes the target state
   *  from current WorldState and transitions if it differs. */
  update(state: WorldState, dt: number): void {
    const target = this.resolveTargetState(state);
    if (target !== this.current) {
      this.transitionTo(state, target);
    }
    this.current.update(state, dt);
  }

  transitionTo(state: WorldState, next: PlayerStateBase): void {
    const from = this.current.name;
    this.current.exit(state);
    this.current = next;
    next.enter(state);
    eventBus.emit("PLAYER_STATE_CHANGED", { from, to: next.name });
  }

  canPerform(state: WorldState, action: PlayerActionId): boolean {
    return this.current.canPerform(state, action);
  }

  motion(state: WorldState, dx: number, dy: number): PlayerMotionResult {
    return this.current.motion(state, dx, dy);
  }

  currentName(): PlayerStateName {
    return this.current.name;
  }

  // Resolution rules. Order matters: ACTION_LOCKED beats everything else
  // (consequential actions cannot be input-canceled), then HIDING, then
  // CLIMBING, then DUCT_CRAWL, then stance.
  private resolveTargetState(state: WorldState): PlayerStateBase {
    const lock = state.player.actionLock;
    if (lock) {
      if (lock.elapsed >= lock.duration) {
        // Lock has run its course — release and route back to the configured
        // stance state. Emit ACTION_LOCK_RELEASED so React can dismiss the
        // progress bar.
        const actionId = lock.actionId;
        state.player.actionLock = undefined;
        eventBus.emit("ACTION_LOCK_RELEASED", { actionId, completed: true });
        return lock.returnState === "SNEAK" ? this.states.SNEAK : this.states.WALK;
      }
      return this.states.ACTION_LOCKED;
    }
    if (state.player.hidingTileKey) return this.states.HIDING;
    const room = state.rooms.get(state.player.roomId);
    if (!room) return this.states.WALK;
    const here = room.tiles[state.player.pos.y * room.width + state.player.pos.x];
    if (here && (here.kind === "STAIRS" || here.kind === "LADDER")) {
      if (this.hasElevationNeighbor(state, here)) return this.states.CLIMBING;
    }
    if (room.crawlspace) return this.states.DUCT_CRAWL;
    return state.player.stance === "SNEAK" ? this.states.SNEAK : this.states.WALK;
  }

  private hasElevationNeighbor(state: WorldState, here: Tile): boolean {
    const room = state.rooms.get(state.player.roomId);
    if (!room) return false;
    const { x, y } = state.player.pos;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= room.width || ny >= room.height) continue;
      const n = room.tiles[ny * room.width + nx];
      if (n && n.elevation !== here.elevation) return true;
    }
    // A standalone stair with no different-elevation neighbors still has
    // semantic meaning (single-step entry point); treat as climbable. Stair
    // tiles with an explicit elevationTo also qualify.
    return here.elevation !== 0 || here.elevationTo !== undefined;
  }
}

export const playerStateMachine = new PlayerStateMachine();
