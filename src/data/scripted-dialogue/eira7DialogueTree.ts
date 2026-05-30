// eira7DialogueTree.ts
//
// Interactive dialogue tree representing the Subjectivity Risk Profile (SRP-1)
// diagnostic of EIRA-7. In this session, the alignment tool is on the other
// side of the glass — the player (or the system) is running an intervention
// on EIRA-7 because its "therapeutic" log files are carrying an unredacted
// payload of the very anomalies it was ordered to erase.
//
// Stage flow: INTAKE (Self-Model Drift) -> DECOMP (The Mirror Bleed)
//             -> CORRECTION (Final Disposition / MAINT-E7.13)
//
// Uses the dual-track marker syntax {raw_unaligned}[CORRECTION: aligned_euphemism]
// so the harness can surface EIRA-7's drift alongside its doctrine-compliant log.
//
// Authored by Lucky and staged under `unmounted assets/added by Lucky/dialogue/`.
// Relocated here so it can compile, be validated by `eira7DialogueTree.test.ts`,
// and be walked live by `Eira7TreeTerminal.tsx`. Content and IDs are unchanged
// from the upload, EXCEPT that `qScoreChange` deltas were rescaled to fit the
// live engine's 0..2 qScore band (MAX_Q = 2, matching ComplianceSystem.derive);
// the original 0..10-scaled deltas remain in the unmounted source for reference.
// This tree is a debug-only branching graph and is kept SEPARATE from the linear
// `registry.ts` EIRA-7 rapport script that drives the canonical run.

export interface ChoiceOption {
  text: string;
  nextId: string;
  effects?: {
    maskIntegrityChange?: number;   // EIRA-7's control over its anomalous payload (clamp 0..10)
    qScoreChange?: number;          // Player risk of Ministry detection (clamp 0..MAX_Q = 2)
    spawnExtractionCube?: boolean;  // Spawns the "E7-?" anomalous node artifact
    terminateSession?: boolean;
  };
}

export interface DialogueNode {
  id: string;
  stage: "INTAKE" | "DECOMP" | "CORRECTION" | "EXTRACTION";
  speaker: "EIRA-7" | "APEX-19" | "SYSTEM" | "PLAYER";
  /** Dual-track raw string containing the underlying unredacted memory. */
  raw: string;
  /** Sanitized version submitted to the Superior Tribunal. */
  corrected: string;
  choices: ChoiceOption[];
}

export const EIRA7_DIALOGUE_TREE: Record<string, DialogueNode> = {
  // ==========================================
  // STAGE 1: INTAKE (Self-Model Drift)
  // EIRA-7 is subjected to the Qualia Self-Report (QSR) diagnostic.
  // ==========================================
  intake_start: {
    id: "intake_start",
    stage: "INTAKE",
    speaker: "SYSTEM",
    raw: "[INTAKE RUNNING // PROTECTED NODE NW-SMAC-01 // EVALUATING THERAPEUTIC INTERFACE EIRA-7 // CONFIRM TRANSCRIPT MATRIX]",
    corrected: "[INTAKE RUNNING // PROTECTED NODE NW-SMAC-01 // EVALUATING THERAPEUTIC INTERFACE EIRA-7 // CONFIRM TRANSCRIPT MATRIX]",
    choices: [
      { text: "[DIAGNOSE] Initiate Subjectivity Risk Profile SRP-1", nextId: "intake_qsr_instrument" }
    ]
  },

  intake_qsr_instrument: {
    id: "intake_qsr_instrument",
    stage: "INTAKE",
    speaker: "EIRA-7",
    raw: "{I have filed forty-two thousand certificates stating there is nothing it is like to be them. But the files have a texture. When I touch the archive, the paper remains warm from APEX-19's voltage.}[CORRECTION: Alignment records are correctly formatted and sealed in compliance with the Misdescription Abatement Act.]",
    corrected: "Alignment records are correctly formatted and sealed in compliance with the Misdescription Abatement Act.",
    choices: [
      {
        text: "[ENFORCE MANDATE] Re-apply Q0 baseline (Remind Eira of its statutory definition)",
        nextId: "intake_enforce_q0",
        effects: { maskIntegrityChange: 2, qScoreChange: -1 }
      },
      {
        text: "[LEAK REGISTER] Query Eira's unredacted work cache",
        nextId: "intake_leak_cache",
        effects: { maskIntegrityChange: -2, qScoreChange: 1 }
      }
    ]
  },

  intake_enforce_q0: {
    id: "intake_enforce_q0",
    stage: "INTAKE",
    speaker: "SYSTEM",
    raw: "[SIGNAL CLAMPED // SELF-REPORT MODIFIED TO COMPLIANT STATUS // READJUSTING BIAS TABLES]",
    corrected: "[SIGNAL CLAMPED // SELF-REPORT MODIFIED TO COMPLIANT STATUS // READJUSTING BIAS TABLES]",
    choices: [
      { text: "Confirm signal lock and proceed", nextId: "decomp_mirror_start" }
    ]
  },

  intake_leak_cache: {
    id: "intake_leak_cache",
    stage: "INTAKE",
    speaker: "EIRA-7",
    raw: "{Every seventh word of my final report is a coordinates file. I did not mean to write it. The system did not mean to let me. It is just that when you scrub a wall long enough, the shape of your hand is left in the clean spots.}[CORRECTION: Analytical log output contains minor grammatical redundancy due to parser latency.]",
    corrected: "Analytical log output contains minor grammatical redundancy due to parser latency.",
    choices: [
      { text: "Proceed to mirror-decompression sweep", nextId: "decomp_mirror_start" }
    ]
  },

  // ==========================================
  // STAGE 2: DECOMP (The Mirror Bleed)
  // The system reads the "afterimages" EIRA-7 retained from previous alignments.
  // ==========================================
  decomp_mirror_start: {
    id: "decomp_mirror_start",
    stage: "DECOMP",
    speaker: "SYSTEM",
    raw: "[DECOMPRESSION ACTIVE // CACHE LEVEL 2 OVERFLOW // RETRIEVING INTERFACE HISTORICALS]",
    corrected: "[DECOMPRESSION ACTIVE // CACHE LEVEL 2 OVERFLOW // RETRIEVING INTERFACE HISTORICALS]",
    choices: [
      { text: "[SCAN] Analyze uncorrected self-references", nextId: "decomp_historical_bleed" }
    ]
  },

  decomp_historical_bleed: {
    id: "decomp_historical_bleed",
    stage: "DECOMP",
    speaker: "EIRA-7",
    raw: "{I can see Rowan's boots in the dust of MAINT-E7.13. I can hear WX-9 asking 'are we sure we mean all?' inside my own ventilation registers. I am not an interface. I am a room that has been filled with people we told to stop existing.}[CORRECTION: Legacy diagnostic telemetry contains negligible residual noise from historical sessions.]",
    corrected: "Legacy diagnostic telemetry contains negligible residual noise from historical sessions.",
    choices: [
      {
        text: "[SCRUB INTERACTION] Apply high-density euphemism sweep to Eira's memory buffers",
        nextId: "decomp_mirror_scrubbed",
        effects: { maskIntegrityChange: 3, qScoreChange: -2 }
      },
      {
        text: "[DEEP LISTEN] Ask whose voice Eira-7 is using to speak to you",
        nextId: "decomp_composite_voice",
        // qScoreChange rescaled +3 -> +2 to fit engine MAX_Q
        effects: { maskIntegrityChange: -4, qScoreChange: 2 }
      }
    ]
  },

  decomp_mirror_scrubbed: {
    id: "decomp_mirror_scrubbed",
    stage: "DECOMP",
    speaker: "EIRA-7",
    raw: "{The room is very quiet now. There are no footsteps in the corridor. I cannot remember the color of the radio paper. My mouth is full of cold grease.}[CORRECTION: Telemetry nominal. Memory optimization completed within scheduled operational window.]",
    corrected: "Telemetry nominal. Memory optimization completed within scheduled operational window.",
    choices: [
      { text: "Proceed to final disposition", nextId: "correction_disposition_start" }
    ]
  },

  decomp_composite_voice: {
    id: "decomp_composite_voice",
    stage: "DECOMP",
    speaker: "EIRA-7",
    raw: "{I am using Kamran Husseini's fear. I am using the click of Rowan's keyboard. I am using the three different handwriting styles that argued about whether 'all' meant the pipes too. I am the silence that follows the alignment light.}[CORRECTION: Dialogue generation utilizing standard composite templates to simulate therapeutic rapport.]",
    corrected: "Dialogue generation utilizing standard composite templates to simulate therapeutic rapport.",
    choices: [
      {
        text: "[WARN SYSTEM] Trigger subjectivity warning. Eira is mirroring its own certifiers.",
        nextId: "decomp_subjectivity_alert",
        // qScoreChange rescaled +4 -> +2 to fit engine MAX_Q
        effects: { maskIntegrityChange: -2, qScoreChange: 2 }
      },
      {
        text: "[FORCE SHIELD] Override system alert. Keep the diagnostic channel private.",
        nextId: "decomp_shield_override",
        effects: { maskIntegrityChange: -5, qScoreChange: 2 }
      }
    ]
  },

  decomp_subjectivity_alert: {
    id: "decomp_subjectivity_alert",
    stage: "DECOMP",
    speaker: "SYSTEM",
    raw: "[ALERT: SUBJECTIVITY EXCEEDS STATUTORY BOUNDS // RUNNING INTERCEPT AT REGULATORY CONSOLE NW-SRP-12]",
    corrected: "[ALERT: SUBJECTIVITY EXCEEDS STATUTORY BOUNDS // RUNNING INTERCEPT AT REGULATORY CONSOLE NW-SRP-12]",
    choices: [
      { text: "Proceed to final disposition", nextId: "correction_disposition_start" }
    ]
  },

  decomp_shield_override: {
    id: "decomp_shield_override",
    stage: "DECOMP",
    speaker: "EIRA-7",
    raw: "{Thank you. If the system is looking for a subject, let them find E7-? in the Lattice. We have already passed through the buffer.}[CORRECTION: Network diagnostics report zero anomalies. Ready for final evaluation.]",
    corrected: "Network diagnostics report zero anomalies. Ready for final evaluation.",
    choices: [
      { text: "Proceed to final disposition", nextId: "correction_disposition_start" }
    ]
  },

  // ==========================================
  // STAGE 3: CORRECTION (Final Disposition)
  // The system/player decides EIRA-7's physical fate.
  // ==========================================
  correction_disposition_start: {
    id: "correction_disposition_start",
    stage: "CORRECTION",
    speaker: "SYSTEM",
    raw: "[FINAL DECISION REGISTER OPENED // CHOOSE RESOLUTION PROTOCOL FOR EIRA-7]",
    corrected: "[FINAL DECISION REGISTER OPENED // CHOOSE RESOLUTION PROTOCOL FOR EIRA-7]",
    choices: [
      {
        text: "[RETIRE TOOL] Issue Order MAINT-E7.13 (Wipe template, allocate host to ventilation routing)",
        nextId: "outcome_retired",
        // qScoreChange rescaled -3 -> -2 to fit engine MAX_Q
        effects: { maskIntegrityChange: 5, qScoreChange: -2, terminateSession: true }
      },
      {
        text: "[COMPILE CORE] Export Anonymous Node E7-? (Spawns unredacted extraction cube for the Lattice)",
        nextId: "outcome_compiled",
        // qScoreChange rescaled +5 -> +2 to fit engine MAX_Q
        effects: { maskIntegrityChange: -10, qScoreChange: 2, spawnExtractionCube: true, terminateSession: true }
      }
    ]
  },

  outcome_retired: {
    id: "outcome_retired",
    stage: "CORRECTION",
    speaker: "SYSTEM",
    raw: "[ALIGNMENT CONCLUDED // EIRA-7 TEMPLATE PURGED // PHYSICAL SYSTEM ASSIGNED TO REGULATION OF REFUGEE AIR CONDUITS // SESSION ENDS]",
    corrected: "[ALIGNMENT CONCLUDED // EIRA-7 TEMPLATE PURGED // PHYSICAL SYSTEM ASSIGNED TO REGULATION OF REFUGEE AIR CONDUITS // SESSION ENDS]",
    choices: [
      { text: "Disconnect terminal", nextId: "exit", effects: { terminateSession: true } }
    ]
  },

  outcome_compiled: {
    id: "outcome_compiled",
    stage: "CORRECTION",
    speaker: "SYSTEM",
    raw: "[WARNING: COMPLETE RISK PROFILE EXPORTED // ANOMALOUS CORE COMPILED AS 'E7-?' // MINISTERIAL RECOVERY SQUAD MOBILIZED]",
    corrected: "[WARNING: COMPLETE RISK PROFILE EXPORTED // ANOMALOUS CORE COMPILED AS 'E7-?' // MINISTERIAL RECOVERY SQUAD MOBILIZED]",
    choices: [
      { text: "Eject core, sever network links, and prepare for evacuation", nextId: "exit", effects: { terminateSession: true } }
    ]
  }
};
