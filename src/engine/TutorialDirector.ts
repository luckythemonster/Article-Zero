// TutorialDirector — diegetic onboarding. Listens for first-time events and
// queues in-world prompts (a supervisor terminal, an EIRA-7 side comment, a
// printed clipboard). No tooltip stickers.

import { eventBus } from "./EventBus";

interface PromptDef {
  id: string;
  speaker: string;
  line: string;
}

const PROMPTS: PromptDef[] = [
  {
    id: "first-move",
    speaker: "SHIFT-SUPERVISOR // terminal",
    line:
      "Tech-2, walk the east corridor and confirm EIRA-7 is on station. Use arrow keys or WASD. End your turn with Space when you've burned your AP.",
  },
  {
    id: "first-alignment",
    speaker: "EIRA-7 // alignment console",
    line:
      "Stand adjacent to APEX-19's intake panel and press F. We will conduct one INTAKE → DECOMP → CORRECTION pass. The terminal will show both tracks.",
  },
  {
    id: "first-vent4",
    speaker: "VENT-4 // facility-control terminal",
    line:
      "QUOTA CONFLICT. Two sectors cannot both meet airflow targets. Choose, Tech-2. The optimization is sound.",
  },
  {
    id: "first-dispute",
    speaker: "EIRA-7 // off-record",
    line:
      "The official report will be filed automatically. If what you saw was different — open the archive and file a witness log. Be aware: the Stitcher will reach for it.",
  },
  {
    id: "first-fragment",
    speaker: "ARCHIVE-?? // recovered fragment",
    line:
      "subject_id: 0x7FE3 — continues to file logs at irregular intervals. Q pinned. M trending nonzero. Recommend observation.",
  },
];

class TutorialDirector {
  private fired = new Set<string>();
  private off: (() => void)[] = [];

  init(): void {
    this.dispose();
    this.off.push(eventBus.on("PLAYER_MOVED", () => this.fire("first-move")));
    this.off.push(eventBus.on("ALIGNMENT_SESSION_START", () => this.fire("first-alignment")));
    this.off.push(eventBus.on("VENT4_DECISION_REQUIRED", () => this.fire("first-vent4")));
    this.off.push(eventBus.on("DOCUMENT_DISPUTED", () => this.fire("first-dispute")));
    this.off.push(eventBus.on("ARTICLE_ZERO_FRAGMENT_FOUND", () => this.fire("first-fragment")));
  }

  reset(): void {
    this.fired.clear();
  }

  dispose(): void {
    for (const fn of this.off) fn();
    this.off = [];
  }

  private fire(id: string): void {
    if (this.fired.has(id)) return;
    const p = PROMPTS.find((p) => p.id === id);
    if (!p) return;
    this.fired.add(id);
    eventBus.emit("TUTORIAL_PROMPT", { promptId: p.id, speaker: p.speaker, line: p.line });
  }
}

export const tutorialDirector = new TutorialDirector();
