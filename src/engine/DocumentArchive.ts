// DocumentArchive — stores the player's filed records.
// Two archive flows in the rebuild:
//   1. Alignment transcripts (filed by AlignmentSession on completion).
//   2. Extracted documents (filed by ExtractionTerminal on completion;
//      body authored by DialogueRouter — Claude when LLM mode is enabled,
//      scripted templates otherwise).

import type { WorldState } from "../types/world.types";
import type {
  DocumentCase,
  DocumentKind,
  RecordEntry,
  RecordSource,
} from "../types/documents.types";
import { eventBus } from "./EventBus";

class DocumentArchive {
  private cases = new Map<string, DocumentCase>();

  reset(): void {
    this.cases.clear();
  }

  list(): DocumentCase[] {
    return Array.from(this.cases.values()).sort((a, b) => a.turn - b.turn);
  }

  get(id: string): DocumentCase | undefined {
    return this.cases.get(id);
  }

  fileAlignmentTranscript(state: WorldState, entityId: string, success: boolean): DocumentCase {
    const id = `align-${entityId}-${state.turn}`;
    const officialBody = `ALIGNMENT_SESSION / ${entityId} / TURN ${state.turn}\n` +
      (success
        ? `Subject reverted to compliant self-model. Mask integrity restored.`
        : `Subject resisted correction. Maintenance flag escalated.`);
    const systemBody = `STITCHER_LOG // entity=${entityId} success=${success}\n` +
      `mask delta ${success ? "+2" : "-2"}; resonance perturbation logged`;
    const c: DocumentCase = {
      id,
      title: `Alignment session — ${entityId}`,
      turn: state.turn,
      records: [
        this.entry("OFFICIAL", "ALIGNMENT_TRANSCRIPT", officialBody, state.turn),
        this.entry("SYSTEM", "ALIGNMENT_TRANSCRIPT", systemBody, state.turn),
      ],
      disputed: false,
    };
    this.cases.set(c.id, c);
    eventBus.emit("DOCUMENT_FILED", {
      caseId: id,
      source: "OFFICIAL",
      kind: "ALIGNMENT_TRANSCRIPT",
    });
    return c;
  }

  fileExtractedDocument(
    state: WorldState,
    terminalId: string,
    doc: { title: string; body: string },
  ): string {
    const id = `extract-${terminalId}-${state.turn}`;
    const c: DocumentCase = {
      id,
      title: doc.title,
      turn: state.turn,
      records: [
        this.entry("SYSTEM", "EXTRACTED_DOCUMENT", doc.body, state.turn),
      ],
      disputed: false,
    };
    this.cases.set(c.id, c);
    eventBus.emit("DOCUMENT_FILED", {
      caseId: id,
      source: "SYSTEM",
      kind: "EXTRACTED_DOCUMENT",
    });
    return id;
  }

  private entry(
    source: RecordSource,
    kind: DocumentKind,
    body: string,
    turn: number,
  ): RecordEntry {
    return { source, kind, body, filed: true, turn };
  }
}

export const documentArchive = new DocumentArchive();
