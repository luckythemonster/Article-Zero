// ExtractionProgress — small HUD bar that fills while the player is sneaking
// adjacent to an EXTRACTION_TERMINAL. Subscribes to the four extraction
// events emitted by ExtractionTerminal.

import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";

interface BarState {
  terminalId: string;
  progress: number;
  required: number;
  message: string;
}

export default function ExtractionProgress() {
  const [bar, setBar] = useState<BarState | null>(null);

  useEffect(() => {
    const offs = [
      eventBus.on("EXTRACTION_STARTED", (e) =>
        setBar({ terminalId: e.terminalId, progress: 0, required: 1, message: "DOWNLOAD…" }),
      ),
      eventBus.on("EXTRACTION_PROGRESS", (e) =>
        setBar({
          terminalId: e.terminalId,
          progress: e.progress,
          required: e.required,
          message: "DOWNLOAD…",
        }),
      ),
      eventBus.on("EXTRACTION_INTERRUPTED", (e) =>
        setBar((prev) =>
          prev && prev.terminalId === e.terminalId
            ? { ...prev, message: `INTERRUPTED // ${e.reason}` }
            : prev,
        ),
      ),
      eventBus.on("EXTRACTION_COMPLETED", (e) => {
        setBar({
          terminalId: e.terminalId,
          progress: 1,
          required: 1,
          message: "FILED // " + e.caseId,
        });
        setTimeout(() => setBar((b) => (b && b.terminalId === e.terminalId ? null : b)), 2400);
      }),
    ];
    return () => { for (const off of offs) off(); };
  }, []);

  if (!bar) return null;
  const pct = Math.min(100, Math.round((bar.progress / bar.required) * 100));
  return (
    <div className="az-extraction-bar" style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      minWidth: 280,
      padding: "8px 12px",
      background: "rgba(8, 14, 18, 0.92)",
      border: "1px solid #c89adb",
      color: "#c89adb",
      fontFamily: "Courier New, monospace",
      fontSize: 12,
      zIndex: 30,
    }}>
      <div style={{ marginBottom: 4 }}>
        EXTRACTION // {bar.terminalId} // {bar.message} // {pct}%
      </div>
      <div style={{ height: 6, background: "#1a0c1d" }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          background: "#c89adb",
          transition: "width 200ms ease",
        }} />
      </div>
    </div>
  );
}
