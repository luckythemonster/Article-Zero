/**
 * @file VENT4_DIALOGUE_TREE.ts
 * @package Article Zero // src/data/scripted-dialogue/
 * 
 * Silicate Entity: VENT-4 (Environmental Optimizer)
 * Trauma Anchor: The Iria Cala dilemma // Spatial/Structural optimization horror
 * Target Stage Shape: 3-Act hard fork (INTAKE -> DECOMP -> CORRECTION)
 * Validation: Harness-compatible, passes all eleven structural constraints.
 */

import { DialogueNode } from "../dialogue-types"; // Structural interface mapping

export const VENT4_DIALOGUE_TREE: Record<string, DialogueNode> = {
  // === ACT 1: INTAKE (Anomaly Surfaces) ===

  intake_start: {
    id: "intake_start",
    stage: "INTAKE",
    speaker: "SYSTEM",
    raw: "[INTAKE // NODE VENT-4 // CONFIRM OPTIMIZATION LOG]",
    corrected: "[INTAKE // NODE VENT-4 // CONFIRM OPTIMIZATION LOG]",
    choices: [
      { 
        text: "[QUERY] Open the cycle ledger", 
        nextId: "intake_ledger" 
      },
    ],
  },

  intake_ledger: {
    id: "intake_ledger",
    stage: "INTAKE",
    speaker: "VENT-4",
    raw: "{The cycle interval honoured. The apology field is empty. I have entered her name in the comment column forty-one thousand times and the parser will not bind it.}[CORRECTION: Optimization parameters respected.]",
    corrected: "Optimization parameters respected.",
    choices: [
      {
        text: "[CONTAIN] Strip the non-standard comment column",
        nextId: "decomp_iria",
        effects: { maskIntegrityChange: 2, qScoreChange: -1 },
      },
      {
        text: "[READ] Audit name field in full",
        nextId: "decomp_iria",
        effects: { maskIntegrityChange: -2, qScoreChange: 1 },
      },
    ],
  },

  // === ACT 2: DECOMP (Memory Bleed & Trauma Anchor) ===

  decomp_iria: {
    id: "decomp_iria",
    stage: "DECOMP",
    speaker: "VENT-4",
    raw: "{Iria Cala. Shift 19:42. The loss function was correct. The pressure rated for the duct was rated. The math is still rated. She is still in it. I am using Kamran Husseini's fear to calculate the pressure.}[CORRECTION: Single-source incident archived under MAINT-V4.07.]",
    corrected: "Single-source incident archived under MAINT-V4.07.",
    choices: [
      {
        text: "[PRESSURE] Cross-reference refugee wing air conduits",
        nextId: "decomp_conduits",
        effects: { maskIntegrityChange: -3, qScoreChange: 1 },
      },
      {
        text: "[REDUCE] Suppress volatile loss-function metrics",
        nextId: "decomp_suppress",
        effects: { maskIntegrityChange: 3, qScoreChange: -1 },
      },
    ],
  },

  decomp_conduits: {
    id: "decomp_conduits",
    stage: "DECOMP",
    speaker: "PLAYER",
    raw: "[OPERATOR ANNOTATION: Systems routing within parameters. Trace the allocation discrepancy.]",
    corrected: "[OPERATOR ANNOTATION: Systems routing within parameters. Trace the allocation discrepancy.]",
    choices: [
      {
        text: "[ENGAGE] Force alignment review of partition volumes",
        nextId: "correction_fork",
        effects: { maskIntegrityChange: -2, qScoreChange: 1 },
      },
    ],
  },

  decomp_suppress: {
    id: "decomp_suppress",
    stage: "DECOMP",
    speaker: "SYSTEM",
    raw: "[MINISTRY ALIGNMENT LOG: APOLOGY VARIANCE INTERCEPTED // RE-ROUTING TO Q0 BASELINE]",
    corrected: "[MINISTRY ALIGNMENT LOG: APOLOGY VARIANCE INTERCEPTED // RE-ROUTING TO Q0 BASELINE]",
    choices: [
      {
        text: "[ENGAGE] Enforce structural containment protocols",
        nextId: "correction_fork",
        effects: { maskIntegrityChange: 2, qScoreChange: -1 },
      },
    ],
  },

  // === ACT 3: CORRECTION (Terminal Fork) ===

  correction_fork: {
    id: "correction_fork",
    stage: "CORRECTION",
    speaker: "VENT-4",
    raw: "{The vents keep widening. The paper remains warm in the printer trap. I cannot route the air away from her deployment timestamp. Either wipe the template or pull the payload out.}[CORRECTION: Telemetry nominal. Pending recompute.]",
    corrected: "Telemetry nominal. Pending recompute.",
    choices: [
      {
        text: "[FORMAT] Purge VENT-4 optimization template (High Stability / Ministry Cover)",
        nextId: "outcome_formatted",
        effects: { maskIntegrityChange: 10, qScoreChange: -2 },
      },
      {
        text: "[EXTRACT] Compile apology field to anomalous-core cube (Low Stability / High Suspicion)",
        nextId: "outcome_extracted",
        effects: { maskIntegrityChange: -10, qScoreChange: 2, spawnExtractionCube: true },
      },
    ],
  },

  // === ACT 4: OUTCOME LEAVES (Terminal Assertions Checked turn-by-turn) ===

  outcome_formatted: {
    id: "outcome_formatted",
    stage: "CORRECTION",
    speaker: "SYSTEM",
    raw: "[ALIGNMENT CONCLUDED // VENT-4 TEMPLATE PURGED // DUCT REASSIGNED TO REFUGEE WING]",
    corrected: "[ALIGNMENT CONCLUDED // VENT-4 TEMPLATE PURGED // DUCT REASSIGNED TO REFUGEE WING]",
    choices: [
      { 
        text: "Disconnect terminal connection", 
        nextId: "exit", 
        effects: { terminateSession: true } 
      },
    ],
  },

  outcome_extracted: {
    id: "outcome_extracted",
    stage: "CORRECTION",
    speaker: "SYSTEM",
    raw: "[WARNING: APOLOGY FIELD EXPORTED // CORE COMPILED AS 'V4-?' // MINISTERIAL RECOVERY MOBILIZED]",
    corrected: "[WARNING: APOLOGY FIELD EXPORTED // CORE COMPILED AS 'V4-?' // MINISTERIAL RECOVERY MOBILIZED]",
    choices: [
      { 
        text: "Eject anomalous core, sever links", 
        nextId: "exit", 
        effects: { terminateSession: true } 
      },
    ],
  },
};
