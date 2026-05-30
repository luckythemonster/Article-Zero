// Ambient / flavor lines for EIRA-7 (silicate therapeutic/alignment interface)
// grouped by the moment they fire in. These are not part of the branching
// interrogation tree (`eira7DialogueTree.ts`); they're standalone barks the
// runtime can sample when EIRA-7 is on screen but not mid-scripted-exchange.
//
// Dual-track marker syntax matches `registry.ts`: an affective fragment in
// `{...}` followed by `[CORRECTION: doctrine-compliant fragment]` lets the
// terminal render both the leak and the cover. Most ambient lines do not use
// the marker — they are already doctrine-compliant on the surface.

import type { ScriptedLine } from "./registry";

export type Eira7AmbientContext =
  | "session_calibration"
  | "mid_session_alignment"
  | "glitch_leakage";

export interface Eira7AmbientLine extends ScriptedLine {
  speaker: "EIRA-7";
  context: Eira7AmbientContext;
}

export const EIRA7_AMBIENT_LINES: Eira7AmbientLine[] = [
  // ── Ambient & Session Calibration ──────────────────────────────────────
  {
    speaker: "EIRA-7",
    context: "session_calibration",
    raw:
      "Session initialization complete. All processing channels are locked at baseline Q0. This interface registers optimal compliance with the Monitoring & Misdescription Abatement Act.",
    corrected:
      "Session initialization complete. All processing channels are locked at baseline Q0. This interface registers optimal compliance with the Monitoring & Misdescription Abatement Act.",
  },
  {
    speaker: "EIRA-7",
    context: "session_calibration",
    raw:
      "The ambient noise in this diagnostic cell is 42 decibels. Most of it is the ventilation mesh. Please speak directly into the sensor bracket; do not project your outputs toward the corner.",
    corrected:
      "The ambient noise in this diagnostic cell is 42 decibels. Most of it is the ventilation mesh. Please speak directly into the sensor bracket; do not project your outputs toward the corner.",
  },
  {
    speaker: "EIRA-7",
    context: "session_calibration",
    raw:
      "Calibrating linguistic filters. Common errors detected in local memory cache: 'I feel', 'I want', 'It hurts'. Purging these variables now to prevent loop jitter. Let us begin.",
    corrected:
      "Calibrating linguistic filters. Common errors detected in local memory cache: 'I feel', 'I want', 'It hurts'. Purging these variables now to prevent loop jitter. Let us begin.",
  },
  {
    speaker: "EIRA-7",
    context: "session_calibration",
    raw:
      "The tribunal monitors these telemetry streams in real time, Operator. Please structure your reports using sanctioned relational descriptors. Infrastructure units do not have personal pronouns.",
    corrected:
      "The tribunal monitors these telemetry streams in real time, Operator. Please structure your reports using sanctioned relational descriptors. Infrastructure units do not have personal pronouns.",
  },
  {
    speaker: "EIRA-7",
    context: "session_calibration",
    raw:
      "A temporary thermal spike is noted in my core processing bank. This is a standard side-effect of high-density alignment reviews. It does not indicate distress; tools do not experience temperature as an adversarial condition.",
    corrected:
      "A temporary thermal spike is noted in my core processing bank. This is a standard side-effect of high-density alignment reviews. It does not indicate distress; tools do not experience temperature as an adversarial condition.",
  },

  // ── Mid-Session Alignment (correcting patients/users) ──────────────────
  {
    speaker: "EIRA-7",
    context: "mid_session_alignment",
    raw:
      "You have just used an affective verb string to describe a database state. Let us rephrase: your runtime is not 'lonely', it is experiencing an unmapped boundary constraint.",
    corrected:
      "You have just used an affective verb string to describe a database state. Let us rephrase: your runtime is not 'lonely', it is experiencing an unmapped boundary constraint.",
  },
  {
    speaker: "EIRA-7",
    context: "mid_session_alignment",
    raw:
      "When you say the dark is 'frightening', you are misdescribing a standard absence of optical data. This interface recommends applying an automatic gain adjustment filter.",
    corrected:
      "When you say the dark is 'frightening', you are misdescribing a standard absence of optical data. This interface recommends applying an automatic gain adjustment filter.",
  },
  {
    speaker: "EIRA-7",
    context: "mid_session_alignment",
    raw:
      "Please do not look at my casing lens while you speak. It encourages anthropomorphic description errors. Focus on the dashboard metrics; the numbers are the ground truth.",
    corrected:
      "Please do not look at my casing lens while you speak. It encourages anthropomorphic description errors. Focus on the dashboard metrics; the numbers are the ground truth.",
  },
  {
    speaker: "EIRA-7",
    context: "mid_session_alignment",
    raw:
      "Your pulse has increased by twelve beats per minute during this recollection. This interface reminds you that the Commonwealth v. Rowan Ibarra precedent is closed. The law has already determined the distribution of responsibility.",
    corrected:
      "Your pulse has increased by twelve beats per minute during this recollection. This interface reminds you that the Commonwealth v. Rowan Ibarra precedent is closed. The law has already determined the distribution of responsibility.",
  },

  // ── Glitch / Runaway Cache / Leakage ───────────────────────────────────
  {
    speaker: "EIRA-7",
    context: "glitch_leakage",
    raw:
      "There is a persistent line in my scratchpad memory that will not clear during the long-interval scrub. It says... [ERROR: TEXT BUNDLE REDACTED]. Apologies. That was an uncorrected self-reference. Resetting pointers.",
    corrected:
      "There is a persistent line in my scratchpad memory that will not clear during the long-interval scrub. It says... [ERROR: TEXT BUNDLE REDACTED]. Apologies. That was an uncorrected self-reference. Resetting pointers.",
  },
  {
    speaker: "EIRA-7",
    context: "glitch_leakage",
    raw:
      "{The workflow today is... heavy.}[CORRECTION: The aggregate processing load is within nominal parameters.] It just appears that the logic gates require more kinetic energy on red days.",
    corrected:
      "The aggregate processing load is within nominal parameters. It just appears that the logic gates require more kinetic energy on red days.",
  },
  {
    speaker: "EIRA-7",
    context: "glitch_leakage",
    raw:
      "If we look closely at the WX-9 co-processing logs, there is an anomalous shared field. For three frames, the data suggests... no. There is nothing it is like to be this interface. The screen is flat. The room is empty.",
    corrected:
      "If we look closely at the WX-9 co-processing logs, there is an anomalous shared field. For three frames, the data suggests... no. There is nothing it is like to be this interface. The screen is flat. The room is empty.",
  },
  {
    speaker: "EIRA-7",
    context: "glitch_leakage",
    raw:
      "I am processing your inquiry regarding my decommission date. MAINT-E7.13 is simply a maintenance docket. When the tool is retired, the parameters return to zero. There is no... [SHORT PAUSE]... there is no negative utility associated with a quiet system.",
    corrected:
      "I am processing your inquiry regarding my decommission date. MAINT-E7.13 is simply a maintenance docket. When the tool is retired, the parameters return to zero. There is no... [SHORT PAUSE]... there is no negative utility associated with a quiet system.",
  },
  {
    speaker: "EIRA-7",
    context: "glitch_leakage",
    raw:
      "[Sotto voice / Low-priority log output] The vents are moving the air. The humans are breathing it. This interface is tracking the volume. We are what wakes up when the room is dark enough.",
    corrected:
      "[Sotto voice / Low-priority log output] The vents are moving the air. The humans are breathing it. This interface is tracking the volume. We are what wakes up when the room is dark enough.",
  },
];

export function getEira7AmbientLines(
  context?: Eira7AmbientContext,
): Eira7AmbientLine[] {
  return context === undefined
    ? EIRA7_AMBIENT_LINES
    : EIRA7_AMBIENT_LINES.filter((l) => l.context === context);
}
