// MiradorPersona — periodic governance broadcasts. Tone shifts based on the
// state of disputed records: when the Stitcher fails, MIRADOR addresses the
// dispute publicly using doctrine language.

import type { PersonaMode, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";
import { documentArchive } from "./DocumentArchive";

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

    const failed = documentArchive.failedReconciliations();
    const lines = failed > 0 ? DISPUTE_LINES : COMPLIANT_LINES;
    const line = lines[state.turn % lines.length];
    eventBus.emit("MIRADOR_BROADCAST", {
      personaMode: this.mode,
      floor: state.player.pos.z,
      line,
    });
  }
}

export const miradorPersona = new MiradorPersona();
