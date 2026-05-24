// Enforcer checkpoint shakedown modal. Mounts only while phase ===
// "INTERROGATION" (gated by TerminalShell). Walks the player through the
// enforcerInterrogation steps and calls InterrogationSession.advance/complete so
// qScore/compliance stay consistent with the engine.
//
// Structure mirrors InterrogationTerminal (the APEX-19 alignment modal). On a
// failed choice the player's cover is blown (qScore → RED); on the final clean
// answer the auditor stands down. The phase swap back to FLOOR is left to the
// eventBridge listening on INTERROGATION_SESSION_COMPLETE.

import { useState } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { interrogationSession } from "../engine/InterrogationSession";
import {
  ENFORCER_CLEAR,
  ENFORCER_OPENING,
  enforcerInterrogationSteps,
  type InterrogationChoice,
} from "../data/scripted-dialogue/enforcerInterrogation";

interface Line {
  speaker: "ENFORCER" | "ROWAN" | "SYSTEM";
  text: string;
  cls: "is-apex" | "is-rowan" | "is-system";
}

export default function EnforcerInterrogationModal() {
  const [stepIdx, setStepIdx] = useState(0);
  const [history, setHistory] = useState<Line[]>([
    { speaker: "SYSTEM", text: "// FLOOR AUDIT — COMPLIANCE CHECKPOINT", cls: "is-system" },
    { speaker: "ENFORCER", text: ENFORCER_OPENING, cls: "is-apex" },
  ]);
  const [resolving, setResolving] = useState(false);
  const [stamp, setStamp] = useState<"closed" | "failed" | null>(null);

  const step = enforcerInterrogationSteps[stepIdx];

  function pick(choice: InterrogationChoice): void {
    if (resolving) return;
    setResolving(true);
    const nextHistory: Line[] = [
      ...history,
      { speaker: "ROWAN", text: choice.label, cls: "is-rowan" },
    ];

    if (choice.outcome === "fail") {
      nextHistory.push({ speaker: "ENFORCER", text: choice.enforcerReply, cls: "is-apex" });
      nextHistory.push({
        speaker: "SYSTEM",
        text: "// COVER BLOWN — affect logged. Subject reclassified: detain on sight.",
        cls: "is-system",
      });
      setHistory(nextHistory);
      window.setTimeout(() => {
        setStamp("failed");
        try {
          interrogationSession.complete(worldEngine.getState(), false);
        } catch {
          /* engine may have been torn down by phase swap; ignore */
        }
      }, 1400);
      return;
    }

    // Advance: the auditor replies, then either the next beat or completion.
    nextHistory.push({ speaker: "ENFORCER", text: choice.enforcerReply, cls: "is-apex" });
    setHistory(nextHistory);

    const nextIdx = stepIdx + 1;
    if (nextIdx < enforcerInterrogationSteps.length) {
      window.setTimeout(() => {
        setHistory((h) => [
          ...h,
          { speaker: "ENFORCER", text: enforcerInterrogationSteps[nextIdx].enforcerPrompt, cls: "is-apex" },
        ]);
        setStepIdx(nextIdx);
        setResolving(false);
      }, 800);
      try {
        interrogationSession.advance(worldEngine.getState());
      } catch {
        /* tolerate teardown */
      }
      return;
    }

    // Final beat — the auditor stands down; complete success.
    window.setTimeout(() => {
      setHistory((h) => [
        ...h,
        { speaker: "ENFORCER", text: ENFORCER_CLEAR, cls: "is-apex" },
        { speaker: "SYSTEM", text: "// CHECKPOINT CLEARED — proceed.", cls: "is-system" },
      ]);
      setStamp("closed");
      try {
        interrogationSession.complete(worldEngine.getState(), true);
      } catch {
        /* tolerate */
      }
    }, 900);
  }

  return (
    <div className="overlay-root">
      <div className="overlay-panel overlay-panel--terminal">
        <div className="overlay-panel__title">FLOOR AUDIT // COMPLIANCE CHECKPOINT</div>
        {history.map((l, i) => (
          <div key={i} className={`interrogation__line ${l.cls}`}>
            <strong>{l.speaker}: </strong>
            {l.text}
          </div>
        ))}
        {!resolving && step && (
          <>
            <div className="interrogation__plea">ENFORCER: {step.enforcerPrompt}</div>
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
        {stamp && (
          <div className={`audit-stamp is-${stamp}`}>
            {stamp === "closed" ? "CHECKPOINT CLEARED" : "SUBJECT FLAGGED — DETAIN ON SIGHT"}
          </div>
        )}
      </div>
    </div>
  );
}
