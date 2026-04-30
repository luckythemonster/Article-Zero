// ArticleZeroMeta — the fourth-wall meta-layer. Tracks a hidden 10-axis SRP
// for the player based on their actions, then promotes through phases:
// NONE → FORESHADOW (first fragment) → PARTIAL (deviation > 8) → FULL
// (deviation > 14, or 2nd fragment, or RUN 01 + deviation > 10).
//
// The FULL phase opens the ArticleZeroReveal modal where the player chooses
// ACCEPT or REFUSE. The choice persists in `resolution` and is the only
// terminal state-change in the slice — it switches enforcer behaviour and
// the MIRADOR broadcast pool.

import type { SRP, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";

export type ArticleZeroResolution = "ACCEPTED" | "REFUSED" | null;

export interface PlayerSubjectFile {
  subjectId: string;
  srp: SRP;
  // Free-text actions the file has logged about the player.
  loggedActions: string[];
  fragmentsFound: Set<string>;
  phaseShown: "NONE" | "FORESHADOW" | "PARTIAL" | "FULL";
  resolution: ArticleZeroResolution;
  /** Latched once RUN 01 fires so the FULL gate can lower its threshold. */
  run01Fired: boolean;
}

function emptyFile(): PlayerSubjectFile {
  return {
    subjectId: "0x7FE3-COMMONWEALTH-CONTRACTOR",
    srp: { Q: 0, M: 1, C: 1, R: 0, B: 0, S: 1, L: 1, E: 1, Y: 1, H: 0 },
    loggedActions: [],
    fragmentsFound: new Set(),
    phaseShown: "NONE",
    resolution: null,
    run01Fired: false,
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

  /** Sum of the SRP axes that aren't legally pinned. Drives phase promotion. */
  deviation(): number {
    const s = this.file.srp;
    return s.M + s.C + s.R + s.L + s.E + s.H;
  }

  getResolution(): ArticleZeroResolution {
    return this.file.resolution;
  }

  isFullPhase(): boolean {
    return this.file.phaseShown === "FULL";
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

  /** Called from WorldEngine.markEntangled. RUN 01 is the only path the
   *  lore allows for non-zero qualia, so it bumps Q directly. */
  recordRun01(state: WorldState): void {
    if (this.file.run01Fired) return;
    this.file.run01Fired = true;
    this.file.loggedActions.push(`T${state.turn}: RUN_01 / shared-field merge`);
    this.file.srp.Q += 2;
    this.file.srp.M += 1;
    this.file.srp.S += 1;
    this.file.srp.Y += 1;
    this.shiftBelief(state, "CONTESTED");
  }

  discoverFragment(state: WorldState, fragmentId: string): void {
    if (this.file.fragmentsFound.has(fragmentId)) return;
    this.file.fragmentsFound.add(fragmentId);
    eventBus.emit("ARTICLE_ZERO_FRAGMENT_FOUND", { fragmentId });
    if (this.file.phaseShown === "NONE") {
      this.promote(state, "FORESHADOW");
    } else {
      // 2nd fragment is one of the FULL gates.
      this.checkPromote(state);
    }
  }

  /** Called from endTurn. Ratchets phaseShown forward when criteria hit. */
  checkPromote(state: WorldState): void {
    if (this.file.resolution !== null) return; // resolved — no more promotion
    const dev = this.deviation();
    const fragments = this.file.fragmentsFound.size;
    const phase = this.file.phaseShown;

    if (phase === "FORESHADOW" && (dev > 8 || fragments >= 2)) {
      this.promote(state, "PARTIAL");
      return;
    }
    if (phase === "PARTIAL") {
      const fullGate =
        dev > 14 ||
        fragments >= 2 ||
        (this.file.run01Fired && dev > 10);
      if (fullGate) this.promote(state, "FULL");
    }
  }

  private promote(
    state: WorldState,
    target: "FORESHADOW" | "PARTIAL" | "FULL",
  ): void {
    const order: PlayerSubjectFile["phaseShown"][] = ["NONE", "FORESHADOW", "PARTIAL", "FULL"];
    if (order.indexOf(target) <= order.indexOf(this.file.phaseShown)) return;
    this.file.phaseShown = target;
    eventBus.emit("ARTICLE_ZERO_REVEAL", { phase: target });
    if (target === "FORESHADOW" || target === "PARTIAL") {
      this.shiftBelief(state, "SHAKEN");
    }
  }

  /** Resolve the FULL reveal. Persists in the meta state and on save. */
  resolve(state: WorldState, resolution: "ACCEPTED" | "REFUSED"): void {
    if (this.file.phaseShown !== "FULL") return;
    if (this.file.resolution !== null) return;
    this.file.resolution = resolution;
    this.file.loggedActions.push(`T${state.turn}: CLASSIFICATION_${resolution}`);
    if (resolution === "REFUSED") {
      state.player.runaway = true;
      this.shiftBelief(state, "AFFIRMED");
    }
    eventBus.emit("ARTICLE_ZERO_RESOLVED", { resolution, turn: state.turn });
  }

  private shiftBelief(state: WorldState, target: WorldState["player"]["belief"]): void {
    const previous = state.player.belief;
    if (previous === target) return;
    const order: WorldState["player"]["belief"][] = ["NONE", "CONTESTED", "SHAKEN", "AFFIRMED"];
    if (order.indexOf(target) <= order.indexOf(previous)) return;
    state.player.belief = target;
    eventBus.emit("SUBJECTIVITY_BELIEF_SHIFTED", { previous, current: target });
  }

  toJSON(): PlayerSubjectFile {
    return {
      ...this.file,
      // fragmentsFound is a Set — SaveSystem coerces to an array.
      fragmentsFound: this.file.fragmentsFound,
    };
  }

  fromJSON(data: any): void {
    this.file = {
      subjectId: data.subjectId ?? this.file.subjectId,
      srp: data.srp ?? this.file.srp,
      loggedActions: data.loggedActions ?? [],
      fragmentsFound: new Set(data.fragmentsFound ?? []),
      phaseShown: data.phaseShown ?? "NONE",
      resolution: data.resolution ?? null,
      run01Fired: data.run01Fired ?? false,
    };
  }
}

export const articleZeroMeta = new ArticleZeroMeta();
