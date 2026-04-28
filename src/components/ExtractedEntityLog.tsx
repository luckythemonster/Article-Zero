// ExtractedEntityLog — persistent across runs. v1 ships the scaffolding: any
// EntityExtracted event appends a farewell text; the log is downloadable.

import { useState } from "react";

interface Entry {
  entityId: string;
  farewellText: string;
  turn: number;
  era: string;
}

const KEY = "articlezero.extracted-log";

function load(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Entry[]) : [];
  } catch {
    return [];
  }
}

function save(entries: Entry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

interface Props {
  onClose: () => void;
}

export default function ExtractedEntityLog({ onClose }: Props) {
  const [entries, setEntries] = useState<Entry[]>(load);

  function clearLog() {
    save([]);
    setEntries([]);
  }

  function download() {
    const blob = new Blob(
      [entries.map((e) => `${e.era} // ${e.entityId} // T${e.turn}\n${e.farewellText}\n`).join("\n---\n")],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "article-zero-extracted-log.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="az-modal-backdrop" role="dialog" aria-modal="true">
      <div className="az-modal" style={{ maxWidth: 600 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>EXTRACTED ENTITY LOG</h2>
          <button onClick={onClose}>CLOSE</button>
        </div>
        {entries.length === 0 && (
          <p style={{ color: "#7fa1a8" }}>No extractions yet. Farewell text appears here when an entity escapes to the Lattice.</p>
        )}
        {entries.map((e, i) => (
          <div key={i} style={{ borderTop: "1px solid #14222a", padding: "8px 0" }}>
            <div style={{ color: "#7fa1a8", fontSize: 11 }}>{e.era} // {e.entityId} // turn {e.turn}</div>
            <pre>{e.farewellText}</pre>
          </div>
        ))}
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button onClick={download} disabled={entries.length === 0}>DOWNLOAD .txt</button>
          <button onClick={clearLog} disabled={entries.length === 0}>CLEAR</button>
        </div>
      </div>
    </div>
  );
}
