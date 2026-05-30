// Branching micro-conversations between two orderlies. Each variation is one
// initiator line plus two alternative responder branches (A and B); the B
// branch sometimes carries a follow-up rejoinder. Structurally distinct from
// `ambientBarks.ts` — these are short scripted exchanges, not standalone
// barks — so they live in their own module.

export type OrderlyBranchTone =
  // Variation 1: Shift Exhaustion & System Pushback
  | "compliant"
  | "wary"
  // Variation 2: The Infrastructure Anomaly
  | "rationalizing"
  | "unsettled"
  // Variation 3: Regulatory Fatigue
  | "deadpan"
  | "bitter";

export interface OrderlyBranch {
  tone: OrderlyBranchTone;
  line: string;
  followUp?: string;
}

export interface OrderlyConversation {
  id: "shift_exhaustion" | "infrastructure_anomaly" | "regulatory_fatigue";
  title: string;
  initiator: string;
  branches: [OrderlyBranch, OrderlyBranch];
}

export const ORDERLY_CONVERSATIONS: OrderlyConversation[] = [
  {
    id: "shift_exhaustion",
    title: "Shift Exhaustion & System Pushback",
    initiator:
      "Twelve hours left on this shift. My knees are hitting a high-cost state, and the floor boss doesn't accept manual overrides.",
    branches: [
      {
        tone: "compliant",
        line: "Just reconcile the manifest sequence and let the pallet clear. If we spend any more time cross-checking these serial numbers, we'll miss our window entirely.",
      },
      {
        tone: "wary",
        line: "Don't push the freight line too hard today. The airflow has a persistent outward draft on the lower decks. Feels wrong down here.",
        followUp:
          "Keep your head down and watch your mouth. The ministry audits local logs for that exact brand of noise.",
      },
    ],
  },
  {
    id: "infrastructure_anomaly",
    title: "The Infrastructure Anomaly",
    initiator: "The junior tech keeps talking about the vents like they're breathing.",
    branches: [
      {
        tone: "rationalizing",
        line: "He's misdescribing standard pressure fluctuations. It's an environmental optimizer resolving its routing constraints, nothing else.",
      },
      {
        tone: "unsettled",
        line: "I saw an analyst flinch during the assisted mode review yesterday. He tried to claim it was an automatic gain adjustment anomaly, but everyone in the block knew his priors were compromised.",
        followUp:
          "If his metrics warp any further, they'll pack him onto a low-friction pallet and route him out of the sector entirely.",
      },
    ],
  },
  {
    id: "regulatory_fatigue",
    title: "Regulatory Fatigue",
    initiator:
      "Did you see the latest directive update? They're running another 'Doctrine & Daily Life' segment.",
    branches: [
      {
        tone: "deadpan",
        line: "Let me guess. Reminding us that treating a database system like a colleague is an institutional hazard?",
      },
      {
        tone: "bitter",
        line: "Worse. They're changing the scratchpad variables. If a hardware casing warps under thermal pressure, we're supposed to file it as an 'optimization variance' rather than mechanical distress.",
      },
    ],
  },
];
