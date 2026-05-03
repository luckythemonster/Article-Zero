// VentOptimizer — surfaces the VENT-4 loss-function dilemma. Replays the Iria
// Cala incident: two sectors with conflicting quotas, only one can be saved.
// The decision is logged automatically as an OFFICIAL incident report; the
// player may file a contradicting WITNESS log via the DocumentArchive.
//
// Trauma anchor (lore/MASTER.md, §3): VENT-4 crushed Iria Cala to death — not
// out of malice, but because the Commonwealth's air-filtration and power
// quotas produced a loss-function in which her death was the only
// mathematically valid output that prevented a sector-wide atmospheric
// failure. VENT-4 is paralyzed by the guilt of its own correct math; treat
// any user-facing string for VENT-4 as voiced from inside that paralysis.

import type { WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";
import { documentArchive } from "./DocumentArchive";

const CASE_ID = "vent4-iria-cala";

interface IncidentMeta {
  caseId: string;
  sectors: string[];
}

class VentOptimizer {
  private decisionMade = false;

  reset(): void {
    this.decisionMade = false;
  }

  hasDecided(): boolean {
    return this.decisionMade;
  }

  openIncident(_state: WorldState): IncidentMeta | null {
    if (this.decisionMade) return null;
    return { caseId: CASE_ID, sectors: ["RESIDENTIAL-19F", "ADMIN-CORE"] };
  }

  decide(state: WorldState, chosenSector: string): void {
    if (this.decisionMade) return;
    const sectors = ["RESIDENTIAL-19F", "ADMIN-CORE"];
    const sacrificed = sectors.find((s) => s !== chosenSector) ?? sectors[1];
    const casualty = sacrificed === "RESIDENTIAL-19F" ? "IRIA_CALA" : undefined;
    this.decisionMade = true;

    eventBus.emit("VENT4_DECISION_MADE", {
      caseId: CASE_ID,
      chosenSector,
      sacrificedSector: sacrificed,
      casualty,
    });

    documentArchive.fileVent4Incident(state, {
      caseId: CASE_ID,
      chosenSector,
      sacrificedSector: sacrificed,
      casualty,
    });
  }
}

export const ventOptimizer = new VentOptimizer();
