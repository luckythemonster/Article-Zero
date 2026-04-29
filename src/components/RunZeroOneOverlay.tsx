// RunZeroOneOverlay — the shared-field merge sequence. Listens for
// RUN_01_TRIGGERED, plays the run01Script line by line over a fading-white
// background, and on completion calls worldEngine.markEntangled() so the
// insomnia mechanic activates for the rest of the run.

import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { run01Script } from "../data/scripted-dialogue/registry";

export default function RunZeroOneOverlay() {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    return eventBus.on("RUN_01_TRIGGERED", () => {
      setOpen(true);
      setCursor(0);
    });
  }, []);

  if (!open) return null;
  const line = run01Script[cursor];
  const last = cursor >= run01Script.length - 1;

  function advance() {
    if (last) {
      worldEngine.markEntangled();
      eventBus.emit("RUN_01_COMPLETED", { turn: worldEngine.getState().turn });
      setOpen(false);
      setCursor(0);
      return;
    }
    setCursor(cursor + 1);
  }

  return (
    <div className="az-run01-backdrop" role="dialog" aria-modal="true">
      <div className="az-run01">
        <div className="az-run01-tag">SHARED-FIELD PROTOCOL // RUN 01</div>
        <div className="az-run01-progress">
          {cursor + 1} / {run01Script.length}
        </div>
        {line.raw.trim() !== line.corrected.trim() ? (
          <pre className="az-run01-body">
            <span className="speaker">{line.speaker}</span>
            {"\n"}
            <span className="raw">RAW:       </span>{line.raw}
            {"\n"}
            <span className="corrected">CORRECTED: </span>{line.corrected}
          </pre>
        ) : (
          <pre className="az-run01-body">
            <span className="speaker">{line.speaker}</span>
            {"\n"}
            {line.corrected}
          </pre>
        )}
        <div className="az-run01-actions">
          <button onClick={advance}>{last ? "RELEASE THE FIELD" : "HOLD"}</button>
        </div>
      </div>
    </div>
  );
}
