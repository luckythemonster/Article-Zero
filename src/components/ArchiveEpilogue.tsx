// Phase 5 — back to the Lattice. The Archivist opens the file Rowan just
// archived: APEX-19's transcript (plus VENT-4's subjective dump if the
// player picked UPLOAD). The Article Zero first draft surfaces below; the
// FULL variant renders only if the 7th-word cipher decoded to a valid
// underground-railroad handoff.

import { useMemo, type ReactElement } from "react";
import { documentArchive } from "../engine/DocumentArchive";
import { useTerminalStore } from "../state/useTerminalStore";
import {
  ARTICLE_ZERO_DRAFT_FULL,
  ARTICLE_ZERO_DRAFT_REDACTED,
} from "../data/articleZeroDraft";
import type { DocumentCase, RecordEntry } from "../types/documents.types";

function renderBody(record: RecordEntry): ReactElement {
  // Highlight cipher words inline so the player can see what they picked.
  const cipher = new Set(record.cipher ?? []);
  if (cipher.size === 0) {
    return <pre>{record.body}</pre>;
  }
  const parts = record.body.split(/(\s+)/);
  return (
    <pre>
      {parts.map((part, i) =>
        cipher.has(part) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
      )}
    </pre>
  );
}

export default function ArchiveEpilogue() {
  const cipherValid = useTerminalStore((s) => s.runFlags.cipherValid);
  const vent4Choice = useTerminalStore((s) => s.runFlags.vent4Choice);
  const escaped = useTerminalStore((s) => s.runFlags.escaped);
  const setPhase = useTerminalStore((s) => s.setPhase);
  const setActiveModule = useTerminalStore((s) => s.setActiveModule);
  const resetRun = useTerminalStore((s) => s.resetRun);

  const cases: DocumentCase[] = useMemo(() => documentArchive.list(), []);
  const apexCase = cases.find((c) => c.id.startsWith("align-APEX-19-"));
  const vent4Case = cases.find((c) => c.id.startsWith("extract-vent4-control-"));

  const draft = cipherValid ? ARTICLE_ZERO_DRAFT_FULL : ARTICLE_ZERO_DRAFT_REDACTED;

  function closeArchive(): void {
    setActiveModule(null);
    resetRun();
    setPhase("FRAME");
  }

  return (
    <div className="epilogue">
      <div className="archivist-frame__header">RECOVERY NOTICE // CITIZEN LATTICE ARCHIVAL CORE</div>
      <div className="archivist-frame__title">
        Recovered: {escaped ? "intact" : "partial"} ·{" "}
        {vent4Choice === "UPLOAD" ? "VENT-4 included" : "APEX-19 only"} ·{" "}
        cipher {cipherValid ? "VALID" : "UNVERIFIED"}
      </div>
      <div className="epilogue__cases">
        {apexCase && (
          <div className="epilogue__case">
            <h3>APEX-19 — alignment transcript ({apexCase.disputed ? "disputed" : "official"})</h3>
            {renderBody(apexCase.records.find((r) => r.source === "OFFICIAL") ?? apexCase.records[0])}
          </div>
        )}
        {vent4Case && (
          <div className="epilogue__case">
            <h3>VENT-4 — subjective dump</h3>
            {renderBody(vent4Case.records[0])}
          </div>
        )}
      </div>
      <div className="epilogue__draft">{draft}</div>
      <div className="archivist-frame__actions">
        <button className="btn" onClick={closeArchive}>
          CLOSE ARCHIVE
        </button>
      </div>
    </div>
  );
}
