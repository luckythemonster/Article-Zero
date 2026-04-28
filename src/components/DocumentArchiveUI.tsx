// DocumentArchiveUI — three-column diff view (OFFICIAL / WITNESS / SYSTEM).
// Players file a WITNESS log via the textarea; if it differs from OFFICIAL,
// the case is marked disputed and goes to the StitcherTimer queue.

import { useEffect, useState } from "react";
import { documentArchive } from "../engine/DocumentArchive";
import { worldEngine } from "../engine/WorldEngine";
import { eventBus } from "../engine/EventBus";
import type { DocumentCase, RecordSource } from "../types/documents.types";

interface Props {
  onClose: () => void;
}

export default function DocumentArchiveUI({ onClose }: Props) {
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  useEffect(() => {
    const offs = [
      eventBus.on("DOCUMENT_FILED", refresh),
      eventBus.on("DOCUMENT_DISPUTED", refresh),
      eventBus.on("DOCUMENT_CORRECTED", refresh),
      eventBus.on("STITCHER_RECONCILED", refresh),
    ];
    return () => { for (const off of offs) off(); };
  }, []);

  const cases = documentArchive.list();

  return (
    <div className="az-modal-backdrop" role="dialog" aria-modal="true">
      <div className="az-modal az-archive">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>DOCUMENT ARCHIVE</h2>
          <button onClick={onClose}>CLOSE</button>
        </div>
        {cases.length === 0 && (
          <p style={{ color: "#7fa1a8" }}>No filings yet. Cases appear here when an alignment session
            completes or a VENT-4 incident closes.</p>
        )}
        {cases.map((c) => (
          <CaseView key={c.id} c={c} />
        ))}
      </div>
    </div>
  );
}

function CaseView({ c }: { c: DocumentCase }) {
  const official = c.records.find((r) => r.source === "OFFICIAL");
  const system = c.records.find((r) => r.source === "SYSTEM");
  const witness = c.records.find((r) => r.source === "WITNESS");

  const [draft, setDraft] = useState<string>(witness?.body ?? "");

  function fileWitness() {
    const state = worldEngine.getState();
    documentArchive.fileWitness(state, c.id, draft);
  }

  return (
    <div className="case">
      <h3>
        {c.title}
        {c.disputed && <span style={{ color: "#ff9577", marginLeft: 8 }}>· DISPUTED</span>}
        {c.stitcherOutcome === "PATCHED" && <span style={{ color: "#7fc7d4", marginLeft: 8 }}>· PATCHED</span>}
        {c.stitcherOutcome === "FAILED" && <span style={{ color: "#ff7f7f", marginLeft: 8 }}>· UNRECONCILED</span>}
      </h3>
      <div className="records">
        <div className="col">
          <h4>OFFICIAL</h4>
          <Body text={official?.body ?? "—"} struck={official?.struckThrough} />
        </div>
        <div className="col">
          <h4>WITNESS</h4>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What you saw. Be specific. The Stitcher is fast."
          />
          <button onClick={fileWitness}>FILE WITNESS LOG</button>
          {witness?.struckThrough?.length ? (
            <pre className="struck" style={{ marginTop: 6 }}>{witness.struckThrough.join("\n")}</pre>
          ) : null}
        </div>
        <div className="col">
          <h4>SYSTEM</h4>
          <Body text={system?.body ?? "—"} />
        </div>
      </div>
    </div>
  );
}

function Body({ text, struck }: { text: string; struck?: string[] }) {
  return (
    <pre>
      {text}
      {struck?.length ? <span className="struck">{"\n" + struck.join("\n")}</span> : null}
    </pre>
  );
}

// Re-export the source type so consumers can import from one place.
export type { RecordSource };
