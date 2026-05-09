// NoiseSystem — tracks short-lived sound events the player (and the world)
// emit. Sound bypasses line-of-sight and reaches enforcers through walls,
// matching Metal Gear's audio detection model.
//
// Lifecycle: a noise lives for one turn. emit() pushes it onto
// state.activeNoises during the player's turn; tick() runs at the *start* of
// endTurn (before EnforcerAI) so enforcers can react to it on the same turn.
// After enforcers consume it, the next tick prunes it.

import type { Noise, Vec3, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";

class NoiseSystem {
  reset(): void {
    // Stateless — all data lives on WorldState.activeNoises.
  }

  emit(state: WorldState, noise: Omit<Noise, "turnEmitted">): void {
    const full: Noise = { ...noise, turnEmitted: state.turn };
    state.activeNoises.push(full);
    eventBus.emit("NOISE_EMITTED", {
      pos: full.pos,
      radius: full.radius,
      source: full.source,
    });
  }

  /** Drop noises emitted more than one turn ago. Called once per endTurn
   *  *before* the enforcer/camera ticks fire — at that point state.turn has
   *  just been incremented, so a noise emitted on the player's turn (N)
   *  registers as `delta == 1` and is still audible. The next endTurn (N+2)
   *  will see `delta == 2` and prune it. */
  tick(state: WorldState): void {
    if (state.activeNoises.length === 0) return;
    state.activeNoises = state.activeNoises.filter(
      (n) => state.turn - n.turnEmitted <= 1,
    );
  }

  /** Returns every noise within radius of `listenerPos` on the same floor.
   *  Sound ignores walls. */
  audibleAt(state: WorldState, listenerPos: Vec3): Noise[] {
    const out: Noise[] = [];
    for (const n of state.activeNoises) {
      if (n.pos.z !== listenerPos.z) continue;
      const d = Math.hypot(n.pos.x - listenerPos.x, n.pos.y - listenerPos.y);
      if (d <= n.radius) out.push(n);
    }
    return out;
  }
}

export const noiseSystem = new NoiseSystem();
