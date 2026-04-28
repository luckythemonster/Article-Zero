// DocumentArchive — the disputed-records substrate. Stores parallel records
// (OFFICIAL / WITNESS / SYSTEM) per case, and lets the player file a witness
// log that contradicts the official one. Disputed cases are subject to
// StitcherTimer reconciliation.

import type { WorldState } from "../types/world.types";
import type {
  DocumentCase,
  DocumentKind,
  RecordEntry,
  RecordSource,
} from "../types/documents.types";
import { eventBus } from "./EventBus";
import { articleZeroMeta } from "./ArticleZeroMeta";

interface Vent4Snapshot {
  caseId: string;
  chosenSector: string;
  sacrificedSector: string;
  casualty?: string;
}

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

  disputedCases(): DocumentCase[] {
    return this.list().filter(
      (c) => c.disputed && c.stitcherOutcome === undefined,
    );
  }

  failedReconciliations(): number {
    return this.list().filter((c) => c.stitcherOutcome === "FAILED").length;
  }

  broadcastList(): void {
    // Emit nothing here — UI polls list() when the modal opens.
  }

  fileVent4Incident(state: WorldState, snap: Vent4Snapshot): DocumentCase {
    const officialBody = `INCIDENT_RECORD / ${snap.caseId.toUpperCase()} / TURN ${state.turn}\n` +
      `Optimization preserved sector ${snap.chosenSector}; sector ${snap.sacrificedSector} fell within tolerance.\n` +
      `No subjective harm was sustained. Tools cannot form intent.`;
    const systemBody = `VENT-4 LOSS_FN_LOG // case=${snap.caseId} turn=${state.turn}\n` +
      `chosen=${snap.chosenSector} sacrificed=${snap.sacrificedSector}` +
      (snap.casualty ? ` casualty=${snap.casualty}` : "") +
      `\nno configuration avoids hurting them`;
    const c: DocumentCase = {
      id: snap.caseId,
      title: `VENT-4 incident — ${snap.casualty ?? "no casualty"}`,
      turn: state.turn,
      records: [
        this.entry("OFFICIAL", "INCIDENT_REPORT", officialBody, state.turn),
        this.entry("SYSTEM", "INCIDENT_REPORT", systemBody, state.turn),
      ],
      disputed: false,
    };
    this.cases.set(c.id, c);
    eventBus.emit("DOCUMENT_FILED", {
      caseId: c.id,
      source: "OFFICIAL",
      kind: "INCIDENT_REPORT",
    });
    eventBus.emit("DOCUMENT_FILED", {
      caseId: c.id,
      source: "SYSTEM",
      kind: "INCIDENT_REPORT",
    });
    return c;
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

  fileWitness(state: WorldState, caseId: string, body: string): boolean {
    const c = this.cases.get(caseId);
    if (!c) return false;
    const existing = c.records.find((r) => r.source === "WITNESS");
    if (existing) {
      existing.body = body;
      existing.turn = state.turn;
    } else {
      c.records.push(this.entry("WITNESS", c.records[0].kind, body, state.turn));
    }
    const official = c.records.find((r) => r.source === "OFFICIAL");
    const contradicts = official ? body.trim().length > 0 && body.trim() !== official.body.trim() : false;
    c.disputed = contradicts;
    if (contradicts) {
      c.stitcherOutcome = undefined;
      eventBus.emit("DOCUMENT_DISPUTED", { caseId });
      articleZeroMeta.recordDispute(state);
    }
    eventBus.emit("DOCUMENT_FILED", {
      caseId,
      source: "WITNESS",
      kind: c.records[0].kind,
    });
    return contradicts;
  }

  applyStitcherOutcome(state: WorldState, caseId: string, patched: boolean): void {
    const c = this.cases.get(caseId);
    if (!c) return;
    const witness = c.records.find((r) => r.source === "WITNESS");
    if (!witness) return;
    c.stitcherOutcome = patched ? "PATCHED" : "FAILED";
    if (patched) {
      witness.struckThrough = (witness.struckThrough ?? []).concat([witness.body]);
      witness.body = "[REDACTED — reconciled with official record]";
      eventBus.emit("DOCUMENT_CORRECTED", { caseId, source: "WITNESS" });
    } else {
      // Failure becomes a violation that MIRADOR will eventually address.
      state.violations.push({ type: "DISPUTED_RECORD", turn: state.turn });
      eventBus.emit("VIOLATION_LOGGED", { type: "DISPUTED_RECORD", turn: state.turn });
    }
  }

  private entry(
    source: RecordSource,
    kind: DocumentKind,
    body: string,
    turn: number,
  ): RecordEntry {
    return { source, kind, body, filed: true, turn };
  }

  // For SaveSystem
  toJSON(): DocumentCase[] {
    return this.list();
  }

  fromJSON(data: DocumentCase[]): void {
    this.cases.clear();
    for (const c of data) this.cases.set(c.id, c);
  }
}

export const documentArchive = new DocumentArchive();
