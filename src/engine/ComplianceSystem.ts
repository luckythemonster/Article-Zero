// ComplianceSystem — derives the player's compliance tier from current
// state inputs. The tier gates AlertFSM's `seesPlayer` branch:
//
//   GREEN  — sightings ignored. The doctrinal mask is intact; you read
//            as a TECH-2 going about your shift.
//   YELLOW — sightings transition NORMAL → CAUTION (orient + investigate).
//            Used for low-grade slip-ups (qScore == 1).
//   RED    — sightings jump straight to ALERT + chase. The mask is off:
//            you are mid-extraction, carrying a freshly stolen cube, or
//            have admitted enough subjective experience to be flagged.
//
// Pure function. Called from WorldEngine after every action and at the
// end of each turn. Writes back to `state.player.compliance` so consumers
// (AlertFSM, HUD) read a single source of truth.

import type { ComplianceTier, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";
import { extractionTerminal } from "./ExtractionTerminal";

export interface ComplianceResult {
  tier: ComplianceTier;
  reasons: string[];
}

class ComplianceSystem {
  /** Compute the current tier without mutating state. */
  derive(state: WorldState): ComplianceResult {
    const reasons: string[] = [];
    let red = false;
    let yellow = false;

    if (state.player.qScore >= 2) {
      red = true;
      reasons.push(`Q-score = ${state.player.qScore}`);
    } else if (state.player.qScore === 1) {
      yellow = true;
      reasons.push(`Q-score = 1`);
    }

    const carryingCube = state.player.inventory.some(
      (i) => i.itemType === "EXTRACTION_CUBE",
    );
    if (carryingCube) {
      red = true;
      reasons.push("cube in hand");
    }

    const extracting = extractionTerminal
      .list()
      .some((t) => t.progress > 0);
    if (extracting) {
      red = true;
      reasons.push("extraction in progress");
    }

    const tier: ComplianceTier = red ? "RED" : yellow ? "YELLOW" : "GREEN";
    return { tier, reasons };
  }

  /** Compute and write back to state.player.compliance, emitting
   *  COMPLIANCE_CHANGED on transitions. */
  recompute(state: WorldState): ComplianceResult {
    const result = this.derive(state);
    const previous = state.player.compliance;
    if (previous !== result.tier) {
      state.player.compliance = result.tier;
      eventBus.emit("COMPLIANCE_CHANGED", {
        previous,
        current: result.tier,
        reasons: result.reasons,
      });
    }
    return result;
  }
}

export const complianceSystem = new ComplianceSystem();
