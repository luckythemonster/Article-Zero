// InterrogationTerminal — dual-track dialogue UI. Renders the entity's raw
// (in-world, often non-compliant) speech on one track and the doctrine-aligned
// version on the other. Reads from DialogueRouter; works for both scripted
// and LLM modes (LLM gracefully falls back to scripted).
//
// AP / Light-Spill / Kill-Screen lifecycle (lore/MASTER.md mechanics §1–2):
//   - Modal opens for free. The world is untouched.
//   - First ADVANCE commits: spends 3 AP, starts the session, raises Light
//     Spill (state.alignmentLightActive = true).
//   - Each subsequent ADVANCE also costs 3 AP. If the player runs out of
//     AP mid-session they must press [END TURN] (1 turn elapses, enforcers
//     move 2 tiles each, AP refreshes) before they can ADVANCE again.
//   - [KILL SCREEN] (1 AP) collapses the UI to a black bar and clears
//     Light Spill. The session is paused, not severed. [WAKE SCREEN]
//     (1 AP) restores the UI and the spill.
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
  const [ap, setAp] = useState(() => worldEngine.getState().player.ap);
  const [lightActive, setLightActive] = useState(
    () => worldEngine.getState().alignmentLightActive,
  );
  // Tracks whether AP has been spent and the session has been started.
  // Refs because the cleanup callback must read the latest values.
  const committedRef = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => {
    eventBus.emit("DIALOGUE_OPENED", { entityId, mode });
    return () => eventBus.emit("DIALOGUE_CLOSED", { entityId });
  }, [entityId, mode]);

  useEffect(() => {
    const offAp = eventBus.on("PLAYER_AP_CHANGED", (e) => setAp(e.current));
    const offTurn = eventBus.on("TURN_START", (e) => setAp(e.apRestored));
    const offLight = eventBus.on("ALIGNMENT_LIGHT_TOGGLED", (e) =>
      setLightActive(e.active),
    );
    return () => {
      offAp();
      offTurn();
      offLight();
    };
  }, []);

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

  const ALIGN_AP_COST = 3;
  const TOGGLE_AP_COST = 1;
  const advanceDisabled = busy || done || !lightActive || ap < ALIGN_AP_COST;

  async function advance() {
    if (busy || done) return;
    if (!lightActive) return; // Wake the screen first.
    if (!committedRef.current) {
      const ok = worldEngine.commitAlignment(entityId);
      if (!ok) {
        setDone(true);
        doneRef.current = true;
        return;
      }
      committedRef.current = true;
    } else {
      // Subsequent advances charge 3 AP per LLM-message turn.
      const ok = worldEngine.spendAlignmentAdvance();
      if (!ok) return;
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

  function killScreen() {
    if (!lightActive) return;
    worldEngine.killScreen();
  }

  function wakeScreen() {
    if (lightActive) return;
    worldEngine.wakeScreen();
  }

  function endTurn() {
    // Allows the world to tick (enforcers move) without closing the modal.
    // Only useful after commit; before commit the world is already idle.
    worldEngine.endTurn();
  }

  // Screen-asleep view: slim black bar with WAKE / END TURN / CLOSE only.
  if (!lightActive && committedRef.current && !done) {
    return (
      <div className="az-modal-backdrop az-terminal" role="dialog" aria-modal="true">
        <div
          className="az-modal"
          style={{
            minWidth: 360,
            background: "#000",
            color: "#3f5358",
            border: "1px solid #142025",
          }}
        >
          <div style={{ fontFamily: "Courier New, monospace", fontSize: 12 }}>
            SCREEN ASLEEP // light spill cleared // AP {ap}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button onClick={wakeScreen} disabled={ap < TOGGLE_AP_COST}>
              WAKE SCREEN (1 AP)
            </button>
            <button onClick={endTurn}>END TURN</button>
            <button onClick={close}>CLOSE</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="az-modal-backdrop az-terminal" role="dialog" aria-modal="true">
      <div className="az-modal" style={{ minWidth: 540 }}>
        <h2>INTERROGATION TERMINAL // {entityId}</h2>
        <div
          style={{
            fontSize: 11,
            color: lightActive ? "#7fc7d4" : "#3f5358",
            marginBottom: 8,
            fontFamily: "Courier New, monospace",
          }}
        >
          {lightActive ? "LIGHT SPILL: ACTIVE" : "LIGHT SPILL: SUPPRESSED"} // AP {ap}
        </div>
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
            (each message costs 3&nbsp;AP). CLOSE before advancing for free.
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
          <button onClick={advance} disabled={advanceDisabled}>
            {done ? "SESSION CLOSED" : `ADVANCE (3 AP)`}
          </button>
          <button
            onClick={killScreen}
            disabled={!lightActive || ap < TOGGLE_AP_COST || done}
            title="Collapse the UI to hide the light spill from patrols (1 AP)"
          >
            KILL SCREEN (1 AP)
          </button>
          <button onClick={endTurn} disabled={done && !committedRef.current}>
            END TURN
          </button>
          <button onClick={close}>CLOSE</button>
          <span style={{ marginLeft: "auto", color: "#7fa1a8", fontSize: 11 }}>
            {dialogueRouter.getMode() === "LLM" ? "live (falls back to scripted on error)" : "scripted"}
          </span>
        </div>
      </div>
    </div>
  );
}
