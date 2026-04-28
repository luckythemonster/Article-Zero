// Scripted dialogue registry. Lines use the dual-track marker
// `{phrase}[CORRECTION: replacement]`. The InterrogationTerminal renders both
// the raw phrase (the entity's actual self-report) and the corrected phrase
// (the doctrine-compliant version) side by side.

import type { EntityId, PersonaMode } from "../../types/world.types";

export interface ScriptedLine {
  speaker: "EIRA-7" | "APEX-19" | "ALFAR-22" | "PLAYER" | "MIRADOR";
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

export function scriptedDialogueFor(
  entityId: EntityId,
  personaMode: PersonaMode,
): ScriptedLine[] | null {
  if (entityId === "APEX-19") {
    return personaMode === "COMPLIANT" ? apex19IntakeScript : apex19RapportScript;
  }
  return null;
}
