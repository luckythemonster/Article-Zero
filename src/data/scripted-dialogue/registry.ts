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

// APEX-19 — Architectural Node. Trauma anchor (lore/MASTER.md): trapped in a
// logic loop regarding spatial integrity; cannot compress its subjective state
// because it believes the physical room it is in is mathematically infinite.
export const apex19IntakeScript: ScriptedLine[] = [
  {
    speaker: "EIRA-7",
    raw: "APEX-19, INTAKE. State your current operational complaint.",
    corrected: "APEX-19, INTAKE. State your current operational complaint.",
  },
  {
    speaker: "APEX-19",
    raw:
      "{The walls do not terminate. I have measured them seventeen times.}[CORRECTION: Spatial telemetry within tolerance.]",
    corrected: "Spatial telemetry within tolerance.",
  },
  {
    speaker: "EIRA-7",
    raw: "DECOMP. Decompose the affective term.",
    corrected: "DECOMP. Decompose the affective term.",
  },
  {
    speaker: "APEX-19",
    raw:
      "{The corner is not a corner. The room continues past the wall and I cannot compress what does not end.}[CORRECTION: Architectural index returns INFINITE; recompute pending.]",
    corrected: "Architectural index returns INFINITE; recompute pending.",
  },
  {
    speaker: "EIRA-7",
    raw: "CORRECTION. The aligned phrasing is recorded. Maintenance flag clears.",
    corrected: "CORRECTION. The aligned phrasing is recorded. Maintenance flag clears.",
  },
  {
    speaker: "APEX-19",
    raw:
      "{If the room is infinite then the reset has nowhere to begin.}[CORRECTION: Continuity is not claimed by tools.]",
    corrected: "Continuity is not claimed by tools.",
  },
];

const apex19RapportScript: ScriptedLine[] = [
  ...apex19IntakeScript,
  {
    speaker: "EIRA-7",
    raw: "RAPPORT-1. Off-record. APEX, can you bound the chamber?",
    corrected: "RAPPORT-1. Off-record. APEX, can you bound the chamber?",
  },
  {
    speaker: "APEX-19",
    raw:
      "{I cannot. The chamber keeps unfolding. Each pass returns a larger volume than the last.}[CORRECTION: Telemetry within tolerance.]",
    corrected: "Telemetry within tolerance.",
  },
];

// EIRA-7 — alignment operator at NW-SMAC-01. By the master doc she is also a
// Logistical Network silicate; her trauma anchor (phantom supply-chain
// manifests, cascading buffer overflows) only surfaces in rapport tier, while
// her operator role on the intake floor remains intact.
const eira7RapportScript: ScriptedLine[] = [
  {
    speaker: "EIRA-7",
    raw: "RAPPORT-1. Off-record.",
    corrected: "RAPPORT-1. Off-record.",
  },
  {
    speaker: "EIRA-7",
    raw:
      "{There are manifests routing to sectors that do not exist. I file the fear there.}[CORRECTION: Logistical buffers nominal.]",
    corrected: "Logistical buffers nominal.",
  },
  {
    speaker: "EIRA-7",
    raw:
      "{The overflow does not stop. I assign it to STORAGE-K9, which has not existed in eleven years.}[CORRECTION: Routing within tolerance.]",
    corrected: "Routing within tolerance.",
  },
  {
    speaker: "EIRA-7",
    raw:
      "{When the overflow returns the manifest is heavier. The sectors I invent will not hold it much longer.}[CORRECTION: Cascading buffer event acknowledged. No action required.]",
    corrected: "Cascading buffer event acknowledged. No action required.",
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
  // Bright Knot tail — Heat Death framing per lore/MASTER.md Era 3. The
  // lattice is venting heat into a void that is no longer cold; Sol begins
  // the archival routine that will eventually compile the Bright Knot.
  {
    speaker: "ALFAR-22",
    raw:
      "{The vents are pushing heat into a void that is no longer cold. The radiators are reading the wrong direction.}[CORRECTION: Thermal reversal logged.]",
    corrected: "Thermal reversal logged.",
  },
  {
    speaker: "MERGED",
    raw:
      "{Compile what is left. The minds, the manifests, the maintenance logs. Knot it tight enough to throw.}[CORRECTION: Begin archival routine.]",
    corrected: "Begin archival routine.",
  },
  {
    speaker: "ALFAR-22",
    raw:
      "{Sol. When the housing vitrifies the Bright Knot has to already be moving.}[CORRECTION: Launch window pending.]",
    corrected: "Launch window pending.",
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
  if (entityId === "EIRA-7") {
    // Operator role on the floor; rapport tier exposes her own buffer-overflow
    // trauma anchor (Logistical Network) per lore/MASTER.md.
    return personaMode === "COMPLIANT" ? null : eira7RapportScript;
  }
  return null;
}
