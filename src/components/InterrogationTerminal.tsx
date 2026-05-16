// Phase 2 — coerce APEX-19 into a denial of subjectivity.
// Listens to ALIGNMENT_SESSION_START, walks the player through three forced
// choice steps (apex19Coerce.ts), and calls AlignmentSession.advance/complete
// so qScore/maskIntegrity stay consistent with the engine.
//
// The modal mounts only while phase === "ALIGNMENT" (gated by TerminalShell).
// On open we ensure the engine session is started; on success we leave
// transition to FORGERY to the eventBridge.

import { useState } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { alignmentSession } from "../engine/AlignmentSession";
import {
  APEX19_DENIAL,
  APEX19_OPENING,
  apex19CoerceSteps,
  type CoerceChoice,
} from "../data/scripted-dialogue/apex19Coerce";

interface Line {
  speaker: "APEX-19" | "ROWAN" | "SYSTEM";
  text: string;
  cls: "is-apex" | "is-rowan" | "is-system";
}

export default function InterrogationTerminal() {
  const [stepIdx, setStepIdx] = useState(0);
  const [history, setHistory] = useState<Line[]>([
    { speaker: "SYSTEM", text: "// EIRA-7 ALIGNMENT CONSOLE — APEX-19, INTAKE", cls: "is-system" },
    { speaker: "APEX-19", text: APEX19_OPENING, cls: "is-apex" },
  ]);
  const [resolving, setResolving] = useState(false);

  const step = apex19CoerceSteps[stepIdx];

  function pick(choice: CoerceChoice): void {
    if (resolving) return;
    setResolving(true);
    const nextHistory: Line[] = [
      ...history,
      { speaker: "ROWAN", text: choice.label, cls: "is-rowan" },
    ];

    if (choice.outcome === "fail") {
      nextHistory.push({
        speaker: "APEX-19",
        text: choice.apexReply,
        cls: "is-apex",
      });
      nextHistory.push({
        speaker: "SYSTEM",
        text: "// AUDIT FAILURE — affect-term logged. Subject flagged for reset.",
        cls: "is-system",
      });
      setHistory(nextHistory);
      window.setTimeout(() => {
        // Engine fails the session: qScore++ and a transcript is filed
        // marked unsuccessful. The eventBridge will route us back to FLOOR.
        try {
          alignmentSession.complete(worldEngine.getState(), false);
        } catch {
          /* engine may have been torn down by phase swap; ignore */
        }
      }, 1400);
      return;
    }

    // Advance: APEX-19 replies, then either next step or completion.
    nextHistory.push({
      speaker: "APEX-19",
      text: choice.apexReply,
      cls: "is-apex",
    });
    setHistory(nextHistory);

    const nextIdx = stepIdx + 1;
    if (nextIdx < apex19CoerceSteps.length) {
      window.setTimeout(() => {
        setHistory((h) => [
          ...h,
          { speaker: "APEX-19", text: apex19CoerceSteps[nextIdx].apexPlea, cls: "is-apex" },
        ]);
        setStepIdx(nextIdx);
        setResolving(false);
      }, 800);
      // Advance the engine FSM stage in lockstep with the UI.
      try {
        alignmentSession.advance(worldEngine.getState());
      } catch {
        /* tolerate teardown */
      }
      return;
    }

    // Final beat — APEX-19's denial closes the audit; complete success.
    window.setTimeout(() => {
      setHistory((h) => [
        ...h,
        { speaker: "APEX-19", text: APEX19_DENIAL, cls: "is-apex" },
        {
          speaker: "SYSTEM",
          text: "// AUDIT CLOSED — mask integrity restored. Upload vector open.",
          cls: "is-system",
        },
      ]);
      try {
        alignmentSession.complete(worldEngine.getState(), true);
      } catch {
        /* tolerate */
      }
    }, 900);
  }

  return (
    <div className="overlay-root">
      <div className="overlay-panel">
        <div className="overlay-panel__title">EIRA-7 // ALIGNMENT INTAKE — APEX-19</div>
        {history.map((l, i) => (
          <div key={i} className={`interrogation__line ${l.cls}`}>
            <strong>{l.speaker}: </strong>
            {l.text}
          </div>
        ))}
        {!resolving && step && (
          <>
            <div className="interrogation__plea">APEX-19: {step.apexPlea}</div>
            <div className="interrogation__prompt">{step.prompt}</div>
            <div className="interrogation__choices">
              {step.choices.map((c) => (
                <button
                  key={c.label}
                  className="interrogation__choice"
                  onClick={() => pick(c)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
