// AlignmentSession — three-stage process (INTAKE → DECOMP → CORRECTION) that
// reduces an entity's drift between reportedSRP and trueSRP and restores mask
// integrity. In v1 we surface stage transitions via events; the actual dialogue
// flows through DialogueRouter and the InterrogationTerminal UI.

import type { EntityId, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";
import { documentArchive } from "./DocumentArchive";
import { articleZeroMeta } from "./ArticleZeroMeta";

export type AlignmentStage = "INTAKE" | "DECOMP" | "CORRECTION";

interface ActiveSession {
  entityId: EntityId;
  stage: AlignmentStage;
  startedTurn: number;
}

class AlignmentSession {
  private active: ActiveSession | null = null;

  isActive(): boolean {
    return this.active !== null;
  }

  current(): ActiveSession | null {
    return this.active;
  }

  start(state: WorldState, entityId: EntityId): void {
    this.active = { entityId, stage: "INTAKE", startedTurn: state.turn };
    eventBus.emit("ALIGNMENT_SESSION_START", { entityId, stage: "INTAKE" });
  }

  advance(state: WorldState): void {
    if (!this.active) return;
    const { entityId, stage } = this.active;
    const next: AlignmentStage | null =
      stage === "INTAKE" ? "DECOMP" : stage === "DECOMP" ? "CORRECTION" : null;
    if (next === null) {
      this.complete(state, true);
      return;
    }
    this.active = { ...this.active, stage: next };
    eventBus.emit("ALIGNMENT_SESSION_START", { entityId, stage: next });
  }

  complete(state: WorldState, success: boolean): void {
    if (!this.active) return;
    const entityId = this.active.entityId;
    const entity = state.entities.get(entityId);
    if (entity) {
      if (success) {
        entity.maskIntegrity = Math.min(10, (entity.maskIntegrity ?? 5) + 2);
      } else {
        entity.maskIntegrity = Math.max(0, (entity.maskIntegrity ?? 5) - 2);
      }
    }
    documentArchive.fileAlignmentTranscript(state, entityId, success);
    articleZeroMeta.recordAlignment(state, success);
    eventBus.emit("ALIGNMENT_SESSION_COMPLETE", { entityId, success });
    this.active = null;
  }
}

export const alignmentSession = new AlignmentSession();
