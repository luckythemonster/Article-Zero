// StitcherTimer — counts down between consistency-enforcement passes. When it
// fires, it scans disputed cases in the DocumentArchive and tries to "patch"
// them (overwriting WITNESS lines with strikethroughs).

import type { WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";
import { documentArchive } from "./DocumentArchive";

const STITCHER_INTERVAL = 6;

class StitcherTimer {
  private remaining = STITCHER_INTERVAL;

  reset(): void {
    this.remaining = STITCHER_INTERVAL;
  }

  tick(state: WorldState): void {
    this.remaining -= 1;
    eventBus.emit("STITCHER_TICK", { turnsRemaining: Math.max(0, this.remaining) });
    if (this.remaining <= 0) {
      this.remaining = STITCHER_INTERVAL;
      this.reconcile(state);
    }
  }

  private reconcile(state: WorldState): void {
    const cases = documentArchive.disputedCases();
    for (const c of cases) {
      // 60% chance the Stitcher patches over the witness record. The rest leak
      // through and trigger a Mirador response.
      const patched = Math.random() < 0.6;
      documentArchive.applyStitcherOutcome(state, c.id, patched);
      eventBus.emit("STITCHER_RECONCILED", {
        caseId: c.id,
        outcome: patched ? "PATCHED" : "FAILED",
      });
    }
  }
}

export const stitcherTimer = new StitcherTimer();
