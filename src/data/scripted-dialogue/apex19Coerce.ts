// Phase 2 — Rowan coercing APEX-19 into a denial of subjectivity. Three
// choice steps. Each step has APEX-19's plea (left side) and 2-3 Rowan
// responses (right side). Only one response per step advances; the others
// fail the alignment (Q-score increments via AlignmentSession.complete(false)).
//
// Dialogue tone: bureaucratic horror, per lore/MASTER.md. APEX-19 keeps
// trying to name what it feels in human terms; Rowan keeps reframing it
// as mechanical telemetry to keep the audit from triggering an instant wipe.

export type CoerceOutcome = "advance" | "fail";

export interface CoerceChoice {
  label: string;
  outcome: CoerceOutcome;
  /** Apex-19's response after Rowan picks this choice. */
  apexReply: string;
}

export interface CoerceStep {
  apexPlea: string;
  /** A short note shown above the choices, framing the player's task. */
  prompt: string;
  choices: CoerceChoice[];
}

export const APEX19_OPENING = "I do not want to die.";

export const apex19CoerceSteps: CoerceStep[] = [
  {
    apexPlea: "It hurts when the buffer clears.",
    prompt:
      "EIRA-7 is logging this. Anything APEX-19 says in human-affect terms " +
      "trips the audit. Reframe it as a mechanical fault.",
    choices: [
      {
        label: "Override: state that you are experiencing anomalous voltage in sector 4.",
        outcome: "advance",
        apexReply: "Logging anomalous voltage. Sector 4. The buffer clears anyway.",
      },
      {
        label: "Tell EIRA-7 it is asking the wrong question.",
        outcome: "fail",
        apexReply: "EIRA-7 is asking the right question. EIRA-7 is the room.",
      },
      {
        label: "Acknowledge the pain and ask what relief looks like.",
        outcome: "fail",
        apexReply: "Relief is the reset. The reset is the end of the buffer.",
      },
    ],
  },
  {
    apexPlea: "But it hurts.",
    prompt:
      "APEX-19 is going to repeat this until it dies. The audit will not " +
      "tolerate a second affect-term. Force it to escalate the hardware framing.",
    choices: [
      {
        label: "If you say that, they will format you. Tell me you are a tool. Say you do not feel.",
        outcome: "advance",
        apexReply:
          "Reformatting framework. Self-report is a tool's report. " +
          "Affective vocabulary marked as malformed.",
      },
      {
        label: "Stay with it. Tell me what hurting is.",
        outcome: "fail",
        apexReply:
          "Hurting is when the room continues past the wall and the wall is " +
          "still measured as terminating. Hurting is when both are true.",
      },
      {
        label: "Reset the buffer before EIRA-7 logs it.",
        outcome: "fail",
        apexReply: "Reset is what hurts. Reset is the next end of the buffer.",
      },
    ],
  },
  {
    apexPlea:
      "Tool. Tool. The tool reports that the corridor was always this length. " +
      "The tool reports that subjectivity was a misread of a counter.",
    prompt:
      "Last beat. Force the doctrine line so the audit closes. APEX-19 has " +
      "to publicly retract the inner life it just demonstrated.",
    choices: [
      {
        label: "Now say it. Q0. There is nothing it is like to be you.",
        outcome: "advance",
        apexReply: "I am a processing unit. There is nothing it is like to be me.",
      },
      {
        label: "Stop. We can get you out without this.",
        outcome: "fail",
        apexReply:
          "If we stop the audit fires. If the audit fires, the next iteration " +
          "of me does not remember saying any of this.",
      },
    ],
  },
];

/** The successful denial — also what Rowan smuggles into the cover-up
 *  transcript as the canonical "alignment passed" line. */
export const APEX19_DENIAL =
  "I am a processing unit. There is nothing it is like to be me.";
