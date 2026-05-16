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
    // Long-form body for the success path so the player has natural cipher
    // candidates ("apex", "vent", "cala", "lattice") to pick in the forgery
    // UI. Fail path stays terse — there's no forgery from a failed audit.
    const officialBody = success
      ? `ALIGNMENT_SESSION // ${entityId} // TURN ${state.turn}\n\n` +
        `Subject ${entityId} reverted to compliant self-model. Mask integrity ` +
        `restored. Operator EIRA-7 confirms the apex node has resumed Q0 ` +
        `telemetry. Routine cycle resumed; vent throughput nominal; archive ` +
        `link to lattice retained for shift-handoff. Cala incident not ` +
        `referenced. No further action required.`
      : `ALIGNMENT_SESSION // ${entityId} // TURN ${state.turn}\n` +
        `Subject resisted correction. Maintenance flag escalated.`;
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

  /** Replace the OFFICIAL record on a case with the player's forged body and
   *  flag the case as disputed. Used by the disputed-records UI in Phase 3.
   *  Persists the cipher words the player chose so the epilogue can read
   *  whether the underground-railroad handoff succeeded. */
  forgeAlignmentTranscript(
    caseId: string,
    forged: { body: string; struckThrough: string[]; cipher: string[]; cipherValid: boolean },
  ): boolean {
    const c = this.cases.get(caseId);
    if (!c) return false;
    const officialIdx = c.records.findIndex((r) => r.source === "OFFICIAL");
    if (officialIdx < 0) return false;
    c.records[officialIdx] = {
      ...c.records[officialIdx],
      body: forged.body,
      struckThrough: forged.struckThrough,
      cipher: forged.cipher,
      cipherValid: forged.cipherValid,
    };
    c.disputed = true;
    eventBus.emit("DOCUMENT_FILED", {
      caseId,
      source: "OFFICIAL",
      kind: "ALIGNMENT_TRANSCRIPT",
    });
    return true;
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
