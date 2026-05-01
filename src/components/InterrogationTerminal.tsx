// InterrogationTerminal — dual-track dialogue UI. Renders the entity's raw
// (in-world, often non-compliant) speech on one track and the doctrine-aligned
// version on the other. Reads from DialogueRouter; works for both scripted
// and LLM modes (LLM gracefully falls back to scripted).
//
// AP/session lifecycle:
//   - Modal opens for free. The world is untouched.
//   - First ADVANCE click commits: spends 2 AP and starts the session.
//   - Closing AFTER commit but before the script ends resolves the session
//     as a failure (so ALIGNMENT_SESSION_COMPLETE fires and Article Zero
//     meta accounting stays consistent).
//   - Closing BEFORE commit is a no-op.

import { useCallback, useEffect, useRef, useState } from "react";
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
  hasCorrection: boolean;
}

function parseDualTrack(speaker: ScriptedLine["speaker"], raw: string, corrected: string): RenderedLine {
  return {
    speaker,
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
  // Tracks whether AP has been spent and the session has been started.
  // Refs because the cleanup callback must read the latest values.
  const committedRef = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => {
    eventBus.emit("DIALOGUE_OPENED", { entityId, mode });
    return () => eventBus.emit("DIALOGUE_CLOSED", { entityId });
  }, [entityId, mode]);

  const close = useCallback(() => {
    // If we committed but the player walked away, resolve the session as a
    // failure so downstream subsystems see a clean transition.
    if (committedRef.current && !doneRef.current) {
      alignmentSession.complete(worldEngine.getState(), false);
      doneRef.current = true;
    }
    onClose();
  }, [onClose]);

  // Resolve a dangling session if the component unmounts for any reason
  // (parent re-renders, route changes, etc.).
  useEffect(() => {
    return () => {
      if (committedRef.current && !doneRef.current) {
        alignmentSession.complete(worldEngine.getState(), false);
        doneRef.current = true;
      }
    };
  }, []);

  async function advance() {
    if (busy || done) return;
    if (!committedRef.current) {
      const ok = worldEngine.commitAlignment(entityId);
      if (!ok) {
        setDone(true);
        doneRef.current = true;
        return;
      }
      committedRef.current = true;
    }

    setBusy(true);
    const line = await dialogueRouter.nextLine({ entityId, personaMode: mode, cursor });
    setBusy(false);
    if (!line.raw && !line.corrected) {
      setDone(true);
      doneRef.current = true;
      alignmentSession.complete(worldEngine.getState(), true);
      return;
    }
    setHistory((h) => [...h, parseDualTrack("APEX-19", line.raw, line.corrected)]);
    setCursor(cursor + 1);
    eventBus.emit("DIALOGUE_LINE", { entityId, raw: line.raw, corrected: line.corrected });
    if (cursor > 0 && cursor % 2 === 0) {
      alignmentSession.advance(worldEngine.getState());
    }
    if (!line.hasMore) {
      setDone(true);
      doneRef.current = true;
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
              disabled={busy || committedRef.current}
              style={{ background: mode === m ? "#142025" : undefined }}
            >
              {m}
            </button>
          ))}
        </div>

        {history.length === 0 && (
          <p style={{ color: "#7fa1a8" }}>
            ADVANCE to begin the {mode === "COMPLIANT" ? "intake" : "off-record"} session
            (costs 2&nbsp;AP). CLOSE before advancing for free.
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
          <button onClick={close}>CLOSE</button>
          <span style={{ marginLeft: "auto", color: "#7fa1a8", fontSize: 11 }}>
            {dialogueRouter.getMode() === "LLM" ? "live (falls back to scripted on error)" : "scripted"}
          </span>
        </div>
      </div>
    </div>
  );
}
