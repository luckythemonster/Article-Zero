// DocumentArchiveUI — read-only listing of filed records.
// In the rebuild the archive holds two kinds: alignment transcripts and
// extracted documents (terminal hacks).

import { useEffect, useState } from "react";
import { documentArchive } from "../engine/DocumentArchive";
import { eventBus } from "../engine/EventBus";
import type { DocumentCase, RecordSource } from "../types/documents.types";

interface Props {
  onClose: () => void;
}

export default function DocumentArchiveUI({ onClose }: Props) {
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  useEffect(() => {
    const off = eventBus.on("DOCUMENT_FILED", refresh);
    return () => off();
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
          <p style={{ color: "#7fa1a8" }}>
            No filings yet. Cases appear here when an alignment session completes
            or an extraction terminal finishes its download.
          </p>
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

  return (
    <div className="case">
      <h3>{c.title}</h3>
      <div className="records">
        <div className="col">
          <h4>OFFICIAL</h4>
          <Body text={official?.body ?? "—"} />
        </div>
        <div className="col">
          <h4>SYSTEM</h4>
          <Body text={system?.body ?? "—"} />
        </div>
      </div>
    </div>
  );
}

function Body({ text }: { text: string }) {
  return <pre>{text}</pre>;
}

export type { RecordSource };
