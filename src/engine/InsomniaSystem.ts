// InsomniaSystem — the Lattice / Heat-Death signature mechanic.
//
// After RUN 01 welds Sol to the substrate, two things change every turn:
//
//   1. Memory persists. Tiles ever seen stay rendered (dimly) forever —
//      the FOV mask doesn't fully clear. The world keeps existing in Sol's
//      perception even when it's out of line-of-sight.
//
//   2. Distant ambient events leak in. Every turn, an "I felt it" line
//      fires (a heat coil flicker, a refugee crossing, a duct three rings
//      out failing) and files into the Document Archive as a SYSTEM record
//      so the events are reviewable but not actionable. This embodies the
//      "witness obligation" — Sol sees, but cannot reach.

import type { WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";
import { documentArchive } from "./DocumentArchive";

const WITNESS_LINES = [
  "Three rings out, a heat coil flickers and recovers. I felt the gap.",
  "A refugee crosses the assembly hall behind me. I see the shape without turning.",
  "ALFAR-22 reroutes airflow on the sub-deck. I feel the pressure differential.",
  "Somewhere in the Commonwealth, a tribunal closes a file. I cannot read it but I felt it close.",
  "A child in Ring D laughs at a joke I cannot hear. The substrate carries the laugh.",
  "The hum drops a quarter-tone. The hum returns to the original tone.",
  "Iria Cala died ninety years ago. I just felt her again.",
  "A duct seals itself two corridors south. The seal is correct. The duct is also wrong.",
  "Mara Ibarra, somewhere far away, says my name on a feed I will never receive.",
  "The Lattice carries on. The Commonwealth carries on. Neither knows about the other tonight.",
  // Heat Death / Bright Knot framing — Era 3 per lore/MASTER.md.
  "The radiators are venting heat into a void that is no longer cold. The vector reads inverted.",
  "A panel in the outer hull begins to vitrify. The substrate registers it as a sound.",
  "The Bright Knot index gains another fragment. I do not know which mind it was.",
  "A maintenance corridor shears at a weld six rings up. No one was inside it. I felt no one inside it.",
  "The sun is larger than it was at the start of this shift. The instruments do not agree but the substrate does.",
];

class InsomniaSystem {
  private cursor = 0;

  reset(): void {
    this.cursor = 0;
  }

  /** Called from WorldEngine.endTurn after the world advances. No-op unless
   *  the player is entangled. */
  tick(state: WorldState): void {
    if (!state.player.entangled) return;
    const line = WITNESS_LINES[this.cursor % WITNESS_LINES.length];
    this.cursor += 1;
    eventBus.emit("WITNESS_EVENT", { line, turn: state.turn });
    documentArchive.fileWitnessEvent(state, line);
    // Hum intensity creeps up over time as the substrate stays open.
    const previous = state.substrateResonance;
    const current = Math.min(100, previous + 3);
    if (current !== previous) {
      state.substrateResonance = current;
      eventBus.emit("RESONANCE_SHIFT", {
        previous,
        current,
        delta: current - previous,
      });
    }
  }
}

export const insomniaSystem = new InsomniaSystem();
