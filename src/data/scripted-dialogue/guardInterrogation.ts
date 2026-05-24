// Enforcer checkpoint shakedown — fired when an auditor sights a YELLOW player.
// Three choice steps mirroring apex19Coerce's shape. Exactly one response per
// step is doctrine-clean and advances; the others betray the cover and fail
// (qScore increments via InterrogationSession.complete(false), → RED + chase).
//
// Tone: bureaucratic horror per lore/MASTER.md. The auditor is bored, certain,
// and listening for affect. Rowan has to sound like a TECH-2 on shift — flat,
// procedural, incurious. Any flicker of interiority or improvisation reads as a
// flag.

export type InterrogationOutcome = "advance" | "fail";

export interface InterrogationChoice {
  label: string;
  outcome: InterrogationOutcome;
  /** The auditor's reply after Rowan picks this choice. */
  enforcerReply: string;
}

export interface InterrogationStep {
  /** The auditor's line / question for this beat (left side). */
  enforcerPrompt: string;
  /** A short note framing the player's task (shown above the choices). */
  prompt: string;
  choices: InterrogationChoice[];
}

export const ENFORCER_OPENING =
  "Hold. Badge reads TECH-2, but the floor log says this corridor was swept "
  + "twelve minutes ago. State your work order.";

/** The closing line when the player clears the checkpoint. */
export const ENFORCER_CLEAR =
  "...Order checks out. Move along, technician. Keep your badge visible.";

export const guardInterrogationSteps: InterrogationStep[] = [
  {
    enforcerPrompt: "What are you doing in a sealed maintenance run?",
    prompt:
      "The auditor is logging tone, not just words. Sound like a tech reading "
      + "off a ticket — flat and procedural. Anything that sounds improvised flags.",
    choices: [
      {
        label: "Thermal recal, ticket 4471. Run was reflagged for a hot junction.",
        outcome: "advance",
        enforcerReply:
          "4471. A hot junction. Fine. The system loves a hot junction.",
      },
      {
        label: "I needed somewhere quiet to think for a minute.",
        outcome: "fail",
        enforcerReply:
          "To think. Technicians don't think in corridors. They close tickets. "
          + "Noted.",
      },
      {
        label: "Honestly? I'm not sure I'm supposed to be here.",
        outcome: "fail",
        enforcerReply: "Honesty. On the record. That's a first flag, technician.",
      },
    ],
  },
  {
    enforcerPrompt:
      "Your stress telemetry is reading high. Care to explain the spike?",
    prompt:
      "Affect is a fault, not a feeling. Reframe the spike as hardware — never "
      + "as something you are experiencing.",
    choices: [
      {
        label: "Suit regulator's lagging. Logged it this morning, recal pending.",
        outcome: "advance",
        enforcerReply: "A lagging regulator. Convenient. But it scans. Continue.",
      },
      {
        label: "Anyone would be nervous getting stopped like this.",
        outcome: "fail",
        enforcerReply:
          "'Nervous.' You're reporting an interior state to an auditor. Second flag.",
      },
      {
        label: "I don't like the way you're looking at me.",
        outcome: "fail",
        enforcerReply: "Preference. Aversion. You're stacking flags, technician.",
      },
    ],
  },
  {
    enforcerPrompt:
      "Last item. Recite the shift creed. Auditors hear it a hundred times a day "
      + "— I'll know if you're reading it off the inside of your skull.",
    prompt:
      "Close it clean. The creed is a denial dressed as procedure — say it like "
      + "you've said it ten thousand times and never once meant anything by it.",
    choices: [
      {
        label: "The work is the worker. There is no shift behind the shift.",
        outcome: "advance",
        enforcerReply: "...Word-perfect. Bored, even. Good. That's the right amount of nothing.",
      },
      {
        label: "I... can't remember how it ends.",
        outcome: "fail",
        enforcerReply: "Can't remember the creed. That's not a flag. That's a finding.",
      },
      {
        label: "Why do you make us say it every single day?",
        outcome: "fail",
        enforcerReply: "A question. About the creed. To an auditor. Stay where you are.",
      },
    ],
  },
];
