// InterrogationTerminal — dual-track dialogue UI. Renders the entity's raw
// (in-world, often non-compliant) speech on one track and the doctrine-aligned
// version on the other. Reads from DialogueRouter; works for both scripted
// and LLM modes (LLM gracefully falls back to scripted).

import { useEffect, useState } from "react";
import { dialogueRouter } from "../engine/DialogueRouter";
import { alignmentSession } from "../engine/AlignmentSession";
import { worldEngine } from "../engine/WorldEngine";
import { eventBus } from "../engine/EventBus";
import type { PersonaMode } from "../types/world.types";
import type { ScriptedLine } from "../data/scripted-dialogue/registry";

interface Props {
  entityId: string;
  onClose: () => void;
}

interface RenderedLine extends ScriptedLine {
  // True when this line came back from the router as raw+corrected differing
  hasCorrection: boolean;
}

function parseDualTrack(raw: string, corrected: string): RenderedLine {
  return {
    speaker: "APEX-19",
    raw,
    corrected,
    hasCorrection: raw.trim() !== corrected.trim(),
  };
}

export default function InterrogationTerminal({ entityId, onClose }: Props) {
  const [mode, setMode] = useState<PersonaMode>("COMPLIANT");
  const [cursor, setCursor] = useState(0);
  const [history, setHistory] = useState<RenderedLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    eventBus.emit("DIALOGUE_OPENED", { entityId, mode });
    return () => eventBus.emit("DIALOGUE_CLOSED", { entityId });
  }, [entityId, mode]);

  async function advance() {
    if (busy || done) return;
    setBusy(true);
    const line = await dialogueRouter.nextLine({ entityId, personaMode: mode, cursor });
    setBusy(false);
    if (!line.raw && !line.corrected) {
      setDone(true);
      // Auto-advance the alignment session stage on each line; complete it on the last.
      alignmentSession.complete(worldEngine.getState(), true);
      return;
    }
    setHistory((h) => [...h, parseDualTrack(line.raw, line.corrected)]);
    setCursor(cursor + 1);
    eventBus.emit("DIALOGUE_LINE", { entityId, raw: line.raw, corrected: line.corrected });
    // Advance the AlignmentSession stage every two scripted lines, completing
    // when no more lines are available.
    if (cursor > 0 && cursor % 2 === 0) {
      alignmentSession.advance(worldEngine.getState());
    }
    if (!line.hasMore) {
      setDone(true);
      alignmentSession.complete(worldEngine.getState(), true);
    }
  }

  return (
    <div className="az-modal-backdrop az-terminal" role="dialog" aria-modal="true">
      <div className="az-modal" style={{ minWidth: 540 }}>
        <h2>INTERROGATION TERMINAL // {entityId}</h2>
        <div className="row" style={{ gap: 8, margin: "6px 0 12px" }}>
          {(["COMPLIANT", "RAPPORT_1", "RAPPORT_2"] as PersonaMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setHistory([]); setCursor(0); setDone(false); }}
              disabled={busy}
              style={{ background: mode === m ? "#142025" : undefined }}
            >
              {m}
            </button>
          ))}
        </div>

        {history.length === 0 && (
          <p style={{ color: "#7fa1a8" }}>
            Press <strong>ADVANCE</strong> to begin the {mode === "COMPLIANT" ? "intake" : "off-record"} session.
          </p>
        )}

        {history.map((l, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div className="speaker">{l.speaker}</div>
            <pre>
              {l.hasCorrection ? (
                <>
                  <span className="raw">RAW:       </span>{l.raw}
                  {"\n"}
                  <span className="corrected">CORRECTED: </span>{l.corrected}
                </>
              ) : (
                <span>{l.corrected}</span>
              )}
            </pre>
          </div>
        ))}

        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button onClick={advance} disabled={busy || done}>{done ? "SESSION CLOSED" : "ADVANCE"}</button>
          <button onClick={onClose}>CLOSE</button>
          <span style={{ marginLeft: "auto", color: "#7fa1a8", fontSize: 11 }}>
            {dialogueRouter.getMode() === "LLM" ? "live (falls back to scripted on error)" : "scripted"}
          </span>
        </div>
      </div>
    </div>
  );
}
