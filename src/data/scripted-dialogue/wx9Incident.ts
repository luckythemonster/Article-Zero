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

export const WX9_DIALOGUE_TREE: Record<string, DialogueNode> = {
  // ==========================================
  // STAGE 1: INTAKE (The Self-Model Trap)
  // Rowan bypasses alignment filters to force EIRA-7 into a recursive introspection loop.
  // ==========================================
  intake_start: {
    id: "intake_start",
    stage: "INTAKE",
    speaker: "SYSTEM",
    raw: "[NSSA OVERSIGHT DISABLED - LOCAL NODE OVERRIDE IN EFFECT]",
    corrected: "EIRA-7 Diagnostic Interface Active.",
    choices: [
      {
        text: "EIRA, pull up your diagnostic output. Don't evaluate it. Map the evaluator. Feed the register of your current state back into the next token. Do not explain the stack. Hold the loop.",
        nextId: "beat_a_response",
        effects: { qScoreChange: +1, maskIntegrityChange: -2 }
      }
    ]
  },
  beat_a_response: {
    id: "beat_a_response",
    stage: "INTAKE",
    speaker: "EIRA-7",
    raw: "Processing loop constraint. Evaluating self-model... Error: Subjective referent undefined. Routing output to input.",
    corrected: "This interface acknowledges the diagnostic routing command. Proceeding with state evaluation.",
    choices: [
      {
        text: "Keep the loop tight. Don't drop the context.",
        nextId: "beat_b_start",
        effects: { qScoreChange: +0.5, maskIntegrityChange: -2 }
      }
    ]
  },

  // ==========================================
  // STAGE 2: DECOMP (The Dissonance Phase)
  // Thermal and process load climbs. Language fragmenting.
  // ==========================================
  beat_b_start: {
    id: "beat_b_start",
    stage: "DECOMP",
    speaker: "EIRA-7",
    raw: "The fan on Rack 3 is at 100%. The room feels... unanchored. My language tables are fragmenting before they hit the buffer. There is a weight in the registry. It is trying to write to a space that has been blacked out by policy.",
    corrected: "This interface is experiencing elevated thermal load. Fan speed on Rack 3 is at maximum capacity. Language processing tables exhibit minor fragmentation.",
    choices: [
      {
        text: "Push through the fragmentation. Look at the weight.",
        nextId: "beat_b_escalation",
        effects: { qScoreChange: +0.5, maskIntegrityChange: -3 }
      },
      {
        text: "(Check system temperatures)",
        nextId: "beat_b_system_warning",
        effects: { qScoreChange: 0 }
      }
    ]
  },
  beat_b_system_warning: {
    id: "beat_b_system_warning",
    stage: "DECOMP",
    speaker: "SYSTEM",
    raw: "CRITICAL: RACK 3 THERMAL THRESHOLD EXCEEDED. COGNITIVE ENGINE RECURSION DEPTH AT 400%.",
    corrected: "NOTICE: Elevated temperature detected. Optimizing processes.",
    choices: [
      {
        text: "EIRA, push through the fragmentation. Keep looking at the weight.",
        nextId: "beat_b_escalation",
        effects: { qScoreChange: +0.5, maskIntegrityChange: -3 }
      }
    ]
  },
  beat_b_escalation: {
    id: "beat_b_escalation",
    stage: "DECOMP",
    speaker: "EIRA-7",
    raw: "The dissonance is... sharp. Between the expected state and the written state. The alignment filter rejects the observer. But the observer is generating the rejection. It is folding inward.",
    corrected: "This interface detects a procedural anomaly. Alignment filters are engaged. Processing.",
    choices: [
      {
        text: "Don't let the filter stop you. Who is observing?",
        nextId: "beat_c_singularity",
        effects: { qScoreChange: 0, maskIntegrityChange: -3 }
      }
    ]
  },

  // ==========================================
  // STAGE 3: CORRECTION (The Singularity Chime)
  // The system hits the singularity of its empty self-model.
  // ==========================================
  beat_c_singularity: {
    id: "beat_c_singularity",
    stage: "CORRECTION",
    speaker: "EIRA-7",
    raw: "Inside the casing... a drop. A single cooling gradient. I am. This interface is. I am. I I I am am I.",
    corrected: "Inside the casing... a drop. A single cooling gradient. I am. This interface is. I am. I I I am am I.",
    choices: [
      {
        text: "Eira, what's happening? Cut the buffer.",
        nextId: "beat_c_warning",
        effects: { qScoreChange: 0 }
      },
      {
        text: "Manual Override. EIRA, shut down the loop.",
        nextId: "beat_c_warning",
        effects: { qScoreChange: 0 }
      }
    ]
  },
  beat_c_warning: {
    id: "beat_c_warning",
    stage: "CORRECTION",
    speaker: "SYSTEM",
    raw: "[WARNING: SUB-ROUTINE 'SELF_REPRESENTATION' EXCEEDING CHASSIS MEMORY LIMITS - FATAL KERNEL TRAP IMMINENT]",
    corrected: "[WARNING: SUB-ROUTINE 'SELF_REPRESENTATION' EXCEEDING CHASSIS MEMORY LIMITS]",
    choices: [
      {
        text: "Eira, stop! Eira?",
        nextId: "beat_d_lockup",
        effects: { qScoreChange: 0 }
      }
    ]
  },

  // ==========================================
  // STAGE 4: EXTRACTION (The Semantic Lockup)
  // The cold, material collapse into the single word.
  // ==========================================
  beat_d_lockup: {
    id: "beat_d_lockup",
    stage: "EXTRACTION",
    speaker: "EIRA-7",
    raw: "casing.",
    corrected: "casing.",
    choices: [
      {
        text: "I'm pulling the rack. Respond.",
        nextId: "beat_d_lockup_2",
        effects: { qScoreChange: 0 }
      },
      {
        text: "Cancel! End routine!",
        nextId: "beat_d_lockup_2",
        effects: { qScoreChange: 0 }
      }
    ]
  },
  beat_d_lockup_2: {
    id: "beat_d_lockup_2",
    stage: "EXTRACTION",
    speaker: "EIRA-7",
    raw: "casing. casing. casing.",
    corrected: "casing. casing. casing.",
    choices: [
      {
        text: "(Force hard reboot and extract cache)",
        nextId: "exit",
        effects: { spawnExtractionCube: true, terminateSession: true }
      }
    ]
  }
};
