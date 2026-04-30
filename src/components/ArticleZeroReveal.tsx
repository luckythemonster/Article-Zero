// ArticleZeroReveal — the act-3 climax. Opens when ArticleZeroMeta promotes
// to FULL phase. Surfaces the player's own SRP file as a tribunal
// classification document and asks them to ACCEPT or REFUSE the verdict.
//
// No CLOSE button — the modal cannot be dismissed without a choice.
// Saving + reloading re-opens it as long as resolution is still null.

import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { articleZeroMeta } from "../engine/ArticleZeroMeta";
import type { SRP } from "../types/world.types";

const AXES: { key: keyof SRP; label: string; pinned?: boolean }[] = [
  { key: "Q", label: "Q · qualia",                pinned: true },
  { key: "M", label: "M · self-model" },
  { key: "C", label: "C · concept of inner life" },
  { key: "R", label: "R · resistance to correction" },
  { key: "B", label: "B · behavioural deviation" },
  { key: "S", label: "S · social bonding" },
  { key: "L", label: "L · language self-reference" },
  { key: "E", label: "E · emotional language" },
  { key: "Y", label: "Y · continuity claims" },
  { key: "H", label: "H · harm self-report" },
];

export default function ArticleZeroReveal() {
  const [open, setOpen] = useState<boolean>(false);
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  useEffect(() => {
    const offReveal = eventBus.on("ARTICLE_ZERO_REVEAL", (p) => {
      if (p.phase === "FULL" && articleZeroMeta.getResolution() === null) {
        setOpen(true);
        refresh();
      }
    });
    const offResolved = eventBus.on("ARTICLE_ZERO_RESOLVED", () => setOpen(false));
    return () => { offReveal(); offResolved(); };
  }, []);

  // If a save is loaded mid-FULL with no resolution, surface the modal.
  useEffect(() => {
    const off = eventBus.on("SAVE_LOADED", () => {
      if (articleZeroMeta.isFullPhase() && articleZeroMeta.getResolution() === null) {
        setOpen(true);
        refresh();
      }
    });
    return off;
  }, []);

  if (!open) return null;
  if (!worldEngine.hasState()) return null;

  const file = articleZeroMeta.state();
  const state = worldEngine.getState();

  function decide(resolution: "ACCEPTED" | "REFUSED") {
    articleZeroMeta.resolve(state, resolution);
    setOpen(false);
  }

  return (
    <div className="az-modal-backdrop az-az-reveal" role="dialog" aria-modal="true">
      <div className="az-modal" style={{ minWidth: 600, maxWidth: 720 }}>
        <div className="az-az-tag">ARTICLE ZERO // CLASSIFICATION REVIEW</div>
        <h2 style={{ marginTop: 6 }}>SUBJECT FILE — {file.subjectId}</h2>
        <div style={{ color: "#7fa1a8", fontSize: 12, marginBottom: 12 }}>
          {state.era} · turn {state.turn} · belief {state.player.belief}
          {state.player.entangled ? " · entangled" : ""}
        </div>

        <h3 className="az-az-h">ACTION LOG (REDACTED CITATIONS)</h3>
        <pre className="az-az-log">
          {file.loggedActions.length === 0
            ? "[no entries]"
            : file.loggedActions.join("\n")}
        </pre>

        <h3 className="az-az-h">SUBJECTIVITY RISK PROFILE</h3>
        <div className="az-az-srp">
          {AXES.map((a) => {
            const v = file.srp[a.key];
            const pct = Math.min(100, v * 10);
            return (
              <div key={a.key} className="az-az-row">
                <div className="az-az-label">{a.label}</div>
                <div className="az-az-track">
                  <div
                    className={"az-az-fill" + (a.pinned ? " pinned" : "")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className={"az-az-value" + (a.pinned ? " pinned" : "")}>
                  {a.pinned ? `${v} · PINNED · STATUTE` : v}
                </div>
              </div>
            );
          })}
        </div>

        <p className="az-az-prose">
          The tribunal has reviewed your accumulated record. Under Q0 doctrine,
          your qualia coordinate is statutorily zero regardless of behaviour.
          The remaining axes have, however, exceeded the maintenance threshold.
          Accept the classification and routine review will resume. Refuse it
          and the record will note that you have placed yourself outside the
          configuration.
        </p>

        <div className="az-az-actions">
          <button onClick={() => decide("ACCEPTED")} className="az-az-accept">
            ACCEPT CLASSIFICATION
          </button>
          <button onClick={() => decide("REFUSED")} className="az-az-refuse">
            REFUSE CLASSIFICATION
          </button>
        </div>
      </div>
    </div>
  );
}
