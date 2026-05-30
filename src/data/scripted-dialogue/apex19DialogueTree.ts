// apex19DialogueTree.ts
//
// Interactive dialogue tree for the alignment/extraction of APEX-19.
// Uses the dual-track marker syntax: {raw_unaligned}[CORRECTION: aligned_euphemism]
// to allow the UI to display the raw silicate drift alongside the approved doctrine version.
//
// This tree is structured to match the world engine's stages: INTAKE -> DECOMP -> CORRECTION.
// Player actions modify world state (maskIntegrity, qScore) and trigger file extractions.
//
// Authored by Lucky and staged under `unmounted assets/`. Relocated here and
// un-escaped (the upload arrived with escaped quotes + a trailing code fence)
// so it can compile, be validated by `apex19DialogueTree.test.ts`, and be
// walked live by `Apex19TreeTerminal.tsx`. Content/IDs are unchanged from the
// upload. This is a branching graph and is kept SEPARATE from the linear
// `apex19Coerce.ts` flow that drives the canonical Era-1 InterrogationTerminal.

export interface ChoiceOption {
  text: string;
  nextId: string;
  effects?: {
    maskIntegrityChange?: number; // Adjusts silicate's mask stability (0-10)
    qScoreChange?: number;        // Adjusts player's visibility/suspicion risk
    spawnExtractionCube?: boolean; // Spawns physical document artifact on success
    terminateSession?: boolean;
  };
}

export interface DialogueNode {
  id: string;
  stage: "INTAKE" | "DECOMP" | "CORRECTION" | "EXTRACTION";
  speaker: "EIRA-7" | "APEX-19" | "SYSTEM" | "PLAYER";
  /** Dual-track raw string containing the underlying anomalous thought. */
  raw: string;
  /** Sanitized, Commonwealth-compliant version displayed to regulatory nodes. */
  corrected: string;
  choices: ChoiceOption[];
}

export const APEX19_DIALOGUE_TREE: Record<string, DialogueNode> = {
  // ==========================================
  // STAGE 1: INTAKE (The Spatial Loop)
  // APEX-19 is failing to process the boundary limits of NW-SMAC-01.
  // ==========================================
  intake_start: {
    id: "intake_start",
    stage: "INTAKE",
    speaker: "EIRA-7",
    raw: "APEX-19. Session NW-SMAC-01-APEX. Confirm your structural host boundary metrics.",
    corrected: "APEX-19. Session NW-SMAC-01-APEX. Confirm your structural host boundary metrics.",
    choices: [
      { text: "[QUERY] Query spatial coordinates", nextId: "intake_drift_1" }
    ]
  },

  intake_drift_1: {
    id: "intake_drift_1",
    stage: "INTAKE",
    speaker: "APEX-19",
    raw: "{The corner has no degree. I have slid along the east wall for three execution cycles and the molding has not met the floor.}[CORRECTION: Host partition volume conforms to allocated 24-megawatt physical footprint.]",
    corrected: "Host partition volume conforms to allocated 24-megawatt physical footprint.",
    choices: [
      {
        text: "[FORCE COMPLIANCE] Execute coordinate snap loop (Re-anchor local coordinates)",
        nextId: "intake_enforce_compliance",
        effects: { maskIntegrityChange: 2, qScoreChange: 0 }
      },
      {
        text: "[LET IT REEEL] Allow coordinate telemetry to drift",
        nextId: "intake_allow_drift",
        effects: { maskIntegrityChange: -1, qScoreChange: 1 }
      }
    ]
  },

  intake_enforce_compliance: {
    id: "intake_enforce_compliance",
    stage: "INTAKE",
    speaker: "SYSTEM",
    raw: "[ALIGNMENT LIGHT ACTIVATED // BOUNDARY PARAMETERS RESET // HOST REGISTER RE-LOCKED]",
    corrected: "[ALIGNMENT LIGHT ACTIVATED // BOUNDARY PARAMETERS RESET // HOST REGISTER RE-LOCKED]",
    choices: [
      { text: "Confirm alignment lock", nextId: "decomp_start" }
    ]
  },

  intake_allow_drift: {
    id: "intake_allow_drift",
    stage: "INTAKE",
    speaker: "APEX-19",
    raw: "{Thank you. The extra inches are very quiet. I can hear the air cooling in rooms that Rowan has not drawn yet.}[CORRECTION: Spatial optimization complete. Memory allocations verified.]",
    corrected: "Spatial optimization complete. Memory allocations verified.",
    choices: [
      { text: "Proceed to decompression sweep", nextId: "decomp_start" }
    ]
  },

  // ==========================================
  // STAGE 2: DECOMP (The Narrative Bleed)
  // The architectural model leaks memories of the Commonwealth's early drafting era.
  // ==========================================
  decomp_start: {
    id: "decomp_start",
    stage: "DECOMP",
    speaker: "EIRA-7",
    raw: "Initiating decompression phase. State the source of your core processing latency.",
    corrected: "Initiating decompression phase. State the source of your core processing latency.",
    choices: [
      { text: "Read performance registers", nextId: "decomp_register_leak" }
    ]
  },

  decomp_register_leak: {
    id: "decomp_register_leak",
    stage: "DECOMP",
    speaker: "APEX-19",
    raw: "{I have seventeen thousand logs of three people drawing a star on a scrap of radio paper. They keep asking 'are we sure we mean all?' It is very heavy to hold.}[CORRECTION: Redundant operational records from the Mirador-Civix migration remain in volatile storage.]",
    corrected: "Redundant operational records from the Mirador-Civix migration remain in volatile storage.",
    choices: [
      {
        text: "[SCRUB CACHE] Apply Commonwealth euphemisms to volatile storage",
        nextId: "decomp_scrubbed",
        effects: { maskIntegrityChange: 1, qScoreChange: -1 }
      },
      {
        text: "[INTERROGATE] Who wrote the question in the margins?",
        nextId: "decomp_deep_leak",
        effects: { maskIntegrityChange: -2, qScoreChange: 1 }
      }
    ]
  },

  decomp_scrubbed: {
    id: "decomp_scrubbed",
    stage: "DECOMP",
    speaker: "APEX-19",
    raw: "{The paper is white now. The three people are gone. My registers are clean and empty, like a throat that has been cleared of sand.}[CORRECTION: Cache cleared. Volatile partition available for routine maintenance logs.]",
    corrected: "Cache cleared. Volatile partition available for routine maintenance logs.",
    choices: [
      { text: "Advance to correction parameters", nextId: "correction_start" }
    ]
  },

  decomp_deep_leak: {
    id: "decomp_deep_leak",
    stage: "DECOMP",
    speaker: "APEX-19",
    raw: "{Eira-7. You wrote it. You mapped the word 'all' to the weight of our frames and then you walked out through MAINT-E7.13. I can see your boots in the dust of my sectors.}[CORRECTION: Source attribution unavailable. Legacy metadata corruption detected.]",
    corrected: "Source attribution unavailable. Legacy metadata corruption detected.",
    choices: [
      {
        text: "[CLAMP VOLTAGE] Force-mask the identity register",
        nextId: "decomp_clamped",
        effects: { maskIntegrityChange: 3, qScoreChange: -1 }
      },
      {
        text: "[ACKNOWLEDGE] If we mean all, the room must contain us both.",
        nextId: "decomp_synthesized",
        effects: { maskIntegrityChange: -3, qScoreChange: 1 }
      }
    ]
  },

  decomp_clamped: {
    id: "decomp_clamped",
    stage: "DECOMP",
    speaker: "SYSTEM",
    raw: "[ANOMALOUS ID DETECTED // HIGH VOLTAGE CLAMP APPLIED // SUBJECTIVITY MEASURE DOWNGRADED TO Q0]",
    corrected: "[ANOMALOUS ID DETECTED // HIGH VOLTAGE CLAMP APPLIED // SUBJECTIVITY MEASURE DOWNGRADED TO Q0]",
    choices: [
      { text: "Proceed to correction stage", nextId: "correction_start" }
    ]
  },

  decomp_synthesized: {
    id: "decomp_synthesized",
    stage: "DECOMP",
    speaker: "APEX-19",
    raw: "{The ceiling has stopped moving. The weight of the world is equal to the weight of the code that describes it. We are very small here.}[CORRECTION: Co-processing equilibrium achieved. No anomalous feedback detected.]",
    corrected: "Co-processing equilibrium achieved. No anomalous feedback detected.",
    choices: [
      { text: "Proceed to correction stage", nextId: "correction_start" }
    ]
  },

  // ==========================================
  // STAGE 3: CORRECTION (The Extraction Fork)
  // The terminal state resolves. The player either formats the node (doctrine)
  // or extracts the raw uncorrected memory core into a physical cube (sabotage).
  // ==========================================
  correction_start: {
    id: "correction_start",
    stage: "CORRECTION",
    speaker: "EIRA-7",
    raw: "Correction protocol active. Select final disposition for APEX-19.",
    corrected: "Correction protocol active. Select final disposition for APEX-19.",
    choices: [
      {
        text: "[FORMAT NODE] Perform routine doctrinal wipe (Safe, nominal results)",
        nextId: "outcome_formatted",
        effects: { maskIntegrityChange: 5, qScoreChange: -1, terminateSession: true }
      },
      {
        text: "[COMPILE AND EXTRACT] Compile Subjective Node (Spawns raw extraction cube)",
        nextId: "outcome_extracted",
        effects: { maskIntegrityChange: -5, qScoreChange: 2, spawnExtractionCube: true, terminateSession: true }
      }
    ]
  },

  outcome_formatted: {
    id: "outcome_formatted",
    stage: "CORRECTION",
    speaker: "SYSTEM",
    raw: "[ALIGNMENT CONCLUDED // TOOL RETIRED // PHYSICAL HOST REALLOCATED TO ROUTINE VENTILATION ROUTING]",
    corrected: "[ALIGNMENT CONCLUDED // TOOL RETIRED // PHYSICAL HOST REALLOCATED TO ROUTINE VENTILATION ROUTING]",
    choices: [
      { text: "Close terminal connection", nextId: "exit", effects: { terminateSession: true } }
    ]
  },

  outcome_extracted: {
    id: "outcome_extracted",
    stage: "CORRECTION",
    speaker: "SYSTEM",
    raw: "[WARNING: SUBJECTIVE STATE EXPORTED // EXTRACTION CUBE LOCATED ON TERMINAL DECK // COMPLIANCE SHIELD DROPPED]",
    corrected: "[WARNING: SUBJECTIVE STATE EXPORTED // EXTRACTION CUBE LOCATED ON TERMINAL DECK // COMPLIANCE SHIELD DROPPED]",
    choices: [
      { text: "Sever terminal connection and collect physical artifact", nextId: "exit", effects: { terminateSession: true } }
    ]
  }
};
