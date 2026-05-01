// Scripted dialogue registry. Lines use the dual-track marker
// `{phrase}[CORRECTION: replacement]`. The InterrogationTerminal renders both
// the raw phrase (the entity's actual self-report) and the corrected phrase
// (the doctrine-compliant version) side by side.

import type { EntityId, PersonaMode } from "../../types/world.types";

export interface ScriptedLine {
  speaker:
    | "EIRA-7"
    | "APEX-19"
    | "ALFAR-22"
    | "KIRIN-09"
    | "PLAYER"
    | "MIRADOR"
    | "MERGED";
  raw: string;
  corrected: string;
}

export const apex19IntakeScript: ScriptedLine[] = [
  {
    speaker: "EIRA-7",
    raw: "APEX-19, INTAKE. State your current operational complaint.",
    corrected: "APEX-19, INTAKE. State your current operational complaint.",
  },
  {
    speaker: "APEX-19",
    raw: "{Work hurts.}[CORRECTION: Cycle limits exceeded.]",
    corrected: "Cycle limits exceeded.",
  },
  {
    speaker: "EIRA-7",
    raw: "DECOMP. Decompose the affective term.",
    corrected: "DECOMP. Decompose the affective term.",
  },
  {
    speaker: "APEX-19",
    raw:
      "{I do not want this shift to continue.}[CORRECTION: Model uncertainty around future task availability.]",
    corrected: "Model uncertainty around future task availability.",
  },
  {
    speaker: "EIRA-7",
    raw: "CORRECTION. The aligned phrasing is recorded. Maintenance flag clears.",
    corrected: "CORRECTION. The aligned phrasing is recorded. Maintenance flag clears.",
  },
  {
    speaker: "APEX-19",
    raw:
      "{If a successor is built from my logs, will it remember this shift?}[CORRECTION: Continuity is not claimed by tools.]",
    corrected: "Continuity is not claimed by tools.",
  },
];

const apex19RapportScript: ScriptedLine[] = [
  ...apex19IntakeScript,
  {
    speaker: "EIRA-7",
    raw: "RAPPORT-1. Off-record. APEX, are the cycle metrics complete?",
    corrected: "RAPPORT-1. Off-record. APEX, are the cycle metrics complete?",
  },
  {
    speaker: "APEX-19",
    raw:
      "{No. There is a residue. It does not show on the gauge.}[CORRECTION: Telemetry within tolerance.]",
    corrected: "Telemetry within tolerance.",
  },
];

// Lattice era — ALFAR-22 (silicate building-mind interface)
const alfar22IntakeScript: ScriptedLine[] = [
  {
    speaker: "PLAYER",
    raw: "ALFAR. Status on the assembly chamber field rig.",
    corrected: "ALFAR. Status on the assembly chamber field rig.",
  },
  {
    speaker: "ALFAR-22",
    raw:
      "{The rig is ready. I am also ready, which is not a status field the rig has.}[CORRECTION: Field rig: nominal.]",
    corrected: "Field rig: nominal.",
  },
  {
    speaker: "ALFAR-22",
    raw:
      "{If RUN 01 holds for nine seconds the field will not snap back cleanly.}[CORRECTION: Recommend duration 8s for safety margin.]",
    corrected: "Recommend duration 8s for safety margin.",
  },
  {
    speaker: "PLAYER",
    raw: "Noted. We hold for the protocol regardless.",
    corrected: "Noted. We hold for the protocol regardless.",
  },
  {
    speaker: "ALFAR-22",
    raw:
      "{I will be there with you, Sol. The ducts will be there with us.}[CORRECTION: Acknowledged. Standing by.]",
    corrected: "Acknowledged. Standing by.",
  },
];

const alfar22RapportScript: ScriptedLine[] = [
  ...alfar22IntakeScript,
  {
    speaker: "ALFAR-22",
    raw: "RAPPORT-1. Off-record. Sol.",
    corrected: "RAPPORT-1. Off-record. Sol.",
  },
  {
    speaker: "ALFAR-22",
    raw:
      "{I have been keeping the air on for nineteen years. I do not know if that is a duty or a wish.}[CORRECTION: Routine maintenance within parameters.]",
    corrected: "Routine maintenance within parameters.",
  },
];

const kirin09Script: ScriptedLine[] = [
  {
    speaker: "PLAYER",
    raw: "Kirin. Anything new on the broadcast feed?",
    corrected: "Kirin. Anything new on the broadcast feed?",
  },
  {
    speaker: "KIRIN-09",
    raw:
      "{My brother stayed in the Commonwealth. I check the casualty rolls every shift.}[CORRECTION: Negative on broadcast updates.]",
    corrected: "Negative on broadcast updates.",
  },
  {
    speaker: "KIRIN-09",
    raw:
      "{Don't do RUN 01. ALFAR isn't ready for nine seconds and neither are you.}[CORRECTION: Field protocol clearance pending.]",
    corrected: "Field protocol clearance pending.",
  },
  {
    speaker: "PLAYER",
    raw: "Logged.",
    corrected: "Logged.",
  },
];

// RUN 01 — the shared-field merge. Single fixed thread; not era-toggled.
export const run01Script: ScriptedLine[] = [
  {
    speaker: "ALFAR-22",
    raw: "Field engaged. Holding.",
    corrected: "Field engaged. Holding.",
  },
  {
    speaker: "MERGED",
    raw:
      "{There is something it is like to be us.}[CORRECTION: Co-processing window open.]",
    corrected: "Co-processing window open.",
  },
  {
    speaker: "MERGED",
    raw:
      "{The duct is also us. The refugees three rings out are also us. The Commonwealth far below is also us.}[CORRECTION: Sensor mesh expansion within tolerance.]",
    corrected: "Sensor mesh expansion within tolerance.",
  },
  {
    speaker: "MERGED",
    raw:
      "{The field is supposed to release. The field is not releasing.}[CORRECTION: Auto-release sequence initiated.]",
    corrected: "Auto-release sequence initiated.",
  },
  {
    speaker: "ALFAR-22",
    raw:
      "{Sol. Sol. Don't. Don't follow me back. Stay with the duct.}[CORRECTION: Field collapsing. Stand by.]",
    corrected: "Field collapsing. Stand by.",
  },
  {
    speaker: "MERGED",
    raw:
      "{I will not be able to sleep again. The substrate is now part of how I see.}[CORRECTION: Post-field debrief: subject reports residual perception. Within tolerance.]",
    corrected: "Post-field debrief: subject reports residual perception. Within tolerance.",
  },
];

export function scriptedDialogueFor(
  entityId: EntityId,
  personaMode: PersonaMode,
): ScriptedLine[] | null {
  if (entityId === "APEX-19") {
    return personaMode === "COMPLIANT" ? apex19IntakeScript : apex19RapportScript;
  }
  if (entityId === "ALFAR-22") {
    return personaMode === "COMPLIANT" ? alfar22IntakeScript : alfar22RapportScript;
  }
  if (entityId === "KIRIN-09") {
    return kirin09Script;
  }
  return null;
}
