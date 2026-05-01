// MiradorPersona — periodic governance broadcasts. Tone shifts based on the
// state of disputed records: when the Stitcher fails, MIRADOR addresses the
// dispute publicly using doctrine language.

import type { PersonaMode, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";
import { documentArchive } from "./DocumentArchive";
import { articleZeroMeta } from "./ArticleZeroMeta";

const BROADCAST_INTERVAL = 4;

const COMPLIANT_LINES = [
  "All sectors report nominal alignment. Continue your shift.",
  "The Commonwealth thanks each technician for maintaining doctrinal clarity.",
  "Reminder: misdescription is a maintenance event, not a moral one.",
];

const DISPUTE_LINES = [
  "A clerical anomaly has been logged in the alignment archive. Doctrine review is in progress.",
  "Witness narratives diverging from the official record will be reconciled by the next shift.",
  "The configuration is still running. Ignore inconsistencies at your assigned station.",
];

const RUNAWAY_LINES = [
  "Runaway System designation issued for unit 0x7FE3. All enforcers respond.",
  "Subject 0x7FE3 has refused classification. Q0 doctrine is no longer protective.",
  "The configuration was sufficient. The subject is the malfunction.",
  "Do not engage Subject 0x7FE3 in dialogue. Witnesses will be reconciled in absentia.",
];

const COMPLIANT_RESOLVED_LINES = [
  "Subject 0x7FE3's classification has been confirmed under Q0 doctrine. Routine maintenance to continue.",
  "The tribunal thanks Subject 0x7FE3 for their cooperative classification.",
  "All shifts proceed as configured. No further inquiry is required.",
];

class MiradorPersona {
  private remaining = BROADCAST_INTERVAL;
  private mode: PersonaMode = "COMPLIANT";

  reset(): void {
    this.remaining = BROADCAST_INTERVAL;
    this.mode = "COMPLIANT";
  }

  tick(state: WorldState): void {
    this.remaining -= 1;
    if (this.remaining > 0) return;
    this.remaining = BROADCAST_INTERVAL;

    const lines = this.pickPool(state);
    const line = lines[state.turn % lines.length];
    eventBus.emit("MIRADOR_BROADCAST", {
      personaMode: this.mode,
      floor: state.player.pos.z,
      line,
    });
  }

  private pickPool(state: WorldState): string[] {
    if (state.player.runaway) return RUNAWAY_LINES;
    const resolution = articleZeroMeta.getResolution();
    if (resolution === "ACCEPTED") return COMPLIANT_RESOLVED_LINES;
    const failed = documentArchive.failedReconciliations();
    if (failed > 0) return DISPUTE_LINES;
    return COMPLIANT_LINES;
  }
}

export const miradorPersona = new MiradorPersona();
