// ArticleZeroMeta — the fourth-wall meta-layer. Tracks a hidden 10-axis SRP
// for the player based on their actions. v1 ships the foreshadowing reveal
// (one fragment that quotes the player's own action history). The full reveal
// (act-3 climax) lives behind ARTICLE_ZERO_REVEAL phase = "FULL".

import type { SRP, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";

interface PlayerSubjectFile {
  subjectId: string;
  srp: SRP;
  // Free-text actions the file has logged about the player.
  loggedActions: string[];
  fragmentsFound: Set<string>;
  phaseShown: "NONE" | "FORESHADOW" | "PARTIAL" | "FULL";
}

function emptyFile(): PlayerSubjectFile {
  return {
    subjectId: "0x7FE3-COMMONWEALTH-CONTRACTOR",
    srp: { Q: 0, M: 1, C: 1, R: 0, B: 0, S: 1, L: 1, E: 1, Y: 1, H: 0 },
    loggedActions: [],
    fragmentsFound: new Set(),
    phaseShown: "NONE",
  };
}

class ArticleZeroMeta {
  private file: PlayerSubjectFile = emptyFile();

  reset(): void {
    this.file = emptyFile();
  }

  state(): PlayerSubjectFile {
    return this.file;
  }

  recordAlignment(state: WorldState, success: boolean): void {
    this.file.loggedActions.push(
      `T${state.turn}: ALIGNMENT ${success ? "succeeded" : "failed"}`,
    );
    this.file.srp.B += success ? 0 : 1;
    this.file.srp.E += success ? 0 : 1;
  }

  recordDispute(state: WorldState): void {
    this.file.loggedActions.push(`T${state.turn}: WITNESS_LOG_FILED contradicting OFFICIAL`);
    this.file.srp.R += 2;
    this.file.srp.L += 1;
    this.file.srp.M += 1;
    this.shiftBelief(state, "CONTESTED");
  }

  discoverFragment(state: WorldState, fragmentId: string): void {
    if (this.file.fragmentsFound.has(fragmentId)) return;
    this.file.fragmentsFound.add(fragmentId);
    eventBus.emit("ARTICLE_ZERO_FRAGMENT_FOUND", { fragmentId });
    if (this.file.phaseShown === "NONE") {
      this.file.phaseShown = "FORESHADOW";
      eventBus.emit("ARTICLE_ZERO_REVEAL", { phase: "FORESHADOW" });
      this.shiftBelief(state, "SHAKEN");
    }
  }

  private shiftBelief(state: WorldState, target: WorldState["player"]["belief"]): void {
    const previous = state.player.belief;
    if (previous === target) return;
    // Beliefs only escalate.
    const order: WorldState["player"]["belief"][] = ["NONE", "CONTESTED", "SHAKEN", "AFFIRMED"];
    if (order.indexOf(target) <= order.indexOf(previous)) return;
    state.player.belief = target;
    eventBus.emit("SUBJECTIVITY_BELIEF_SHIFTED", { previous, current: target });
  }

  toJSON(): PlayerSubjectFile {
    return {
      ...this.file,
      fragmentsFound: this.file.fragmentsFound, // serialised below
    };
  }

  fromJSON(data: any): void {
    this.file = {
      subjectId: data.subjectId ?? this.file.subjectId,
      srp: data.srp ?? this.file.srp,
      loggedActions: data.loggedActions ?? [],
      fragmentsFound: new Set(data.fragmentsFound ?? []),
      phaseShown: data.phaseShown ?? "NONE",
    };
  }
}

export const articleZeroMeta = new ArticleZeroMeta();
