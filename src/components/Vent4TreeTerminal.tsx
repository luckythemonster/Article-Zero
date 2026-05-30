// Vent4TreeTerminal — a standalone harness for walking Lucky's branching
// VENT-4 dialogue tree (src/data/scripted-dialogue/vent4DialogueTree.ts).
//
// This is a TEST TOOL, not part of the canonical Era-1 run. It is mounted from
// TerminalShell only while the `vent4DialogueTree` debug flag is on (toggle it
// from the `~` debug overlay). It keeps a SELF-CONTAINED scratch model — a
// seeded maskIntegrity and a player qScore — so it can be opened from any
// screen without a live engine/run, and applies each choice's effects to that
// model the way the engine would, surfacing the result in a live readout HUD.
//
// All styling is inline + self-contained on purpose: this is a debug overlay
// that may render over the title screen, the Phaser canvas, or any other phase,
// so it can't share .overlay-root layout (which is shaped for in-canvas modals
// with reserved D-pad space).
//
// Effect semantics mirror the real engine:
//   • maskIntegrityChange → clamp 0..10           (AlignmentSession.complete)
//   • qScoreChange        → clamp 0..MAX_Q (2)     (RED ceiling — anything higher
//                                                   is wasted; the tree is tuned
//                                                   to live inside this range)
//   • spawnExtractionCube → cube on terminal deck  (ExtractionTerminal.complete)
//   • terminateSession    → end the session
// The compliance tier is derived locally from qScore + cube, matching
// ComplianceSystem.derive's GREEN/YELLOW/RED rules without touching the
// global ExtractionTerminal singleton.

import { useMemo, useState } from "react";
import { useDebugStore } from "../state/useDebugStore";
import type { ComplianceTier } from "../types/world.types";
import {
  VENT4_DIALOGUE_TREE,
  type ChoiceOption,
  type DialogueNode,
} from "../data/scripted-dialogue/vent4DialogueTree";

const START_ID = "intake_start";
const EXIT = "exit";
const SEED_MASK = 5;
// qScore is capped at 2: ComplianceSystem.derive flips to RED at qScore >= 2,
// so anything higher is wasted. The tree's deltas are tuned to live in 0..2.
const MAX_Q = 2;

interface SimState {
  maskIntegrity: number;
  qScore: number;
  cubeSpawned: boolean;
}

const SEED: SimState = { maskIntegrity: SEED_MASK, qScore: 0, cubeSpawned: false };

function applyEffects(s: SimState, fx: ChoiceOption["effects"]): SimState {
  if (!fx) return s;
  let { maskIntegrity, qScore, cubeSpawned } = s;
  if (fx.maskIntegrityChange !== undefined) {
    maskIntegrity = Math.min(10, Math.max(0, maskIntegrity + fx.maskIntegrityChange));
  }
  if (fx.qScoreChange !== undefined) {
    qScore = Math.min(MAX_Q, Math.max(0, qScore + fx.qScoreChange));
  }
  if (fx.spawnExtractionCube) cubeSpawned = true;
  return { maskIntegrity, qScore, cubeSpawned };
}

// Mirror of ComplianceSystem.derive (qScore/cube → tier) for the readout.
function deriveTier(s: SimState): ComplianceTier {
  if (s.qScore >= 2 || s.cubeSpawned) return "RED";
  if (s.qScore === 1) return "YELLOW";
  return "GREEN";
}

const TIER_COLOR: Record<ComplianceTier, string> = {
  GREEN: "#6ad0a4",
  YELLOW: "#ebd14a",
  RED: "#ff5050",
};

const SPEAKER_COLOR: Record<DialogueNode["speaker"], string> = {
  "APEX-19": "#9adbe6",  // silicate cyan
  "EIRA-7":  "#c8e6ed",  // operator pale blue
  "VENT-4":  "#e6b85a",  // optimizer amber (the environmental subject)
  "PLAYER":  "#6ad0a4",  // rowan green
  "SYSTEM":  "#ff5050",  // alert chrome
};

interface LogLine {
  speaker: DialogueNode["speaker"] | "PLAYER";
  text: string;
}

// ── styles ─────────────────────────────────────────────────────────────────
const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(2, 5, 7, 0.94)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "24px 16px",
  overflowY: "auto",
  fontFamily: '"Berkeley Mono", "Courier New", monospace',
};
const panel: React.CSSProperties = {
  width: "min(820px, 100%)",
  background: "#04090b",
  border: "1px solid #1d2a30",
  padding: "16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  color: "#c8e6ed",
};
const titleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderBottom: "1px solid #1d2a30",
  paddingBottom: 8,
};
const title: React.CSSProperties = {
  color: "#ebd14a",
  letterSpacing: "0.12em",
  fontSize: "0.85rem",
  flex: 1,
};
const hudBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 14,
  fontSize: "0.75rem",
  padding: "8px 0",
  borderBottom: "1px dashed #1d2a30",
  color: "#9bb1b6",
};
const transcript: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  maxHeight: "32vh",
  overflowY: "auto",
};
const line = (color: string): React.CSSProperties => ({
  padding: "6px 10px",
  borderLeft: `2px solid ${color}`,
  color,
  fontSize: "0.85rem",
  lineHeight: 1.5,
});
const drift: React.CSSProperties = {
  padding: "6px 10px",
  borderLeft: "2px dashed #e6b85a",
  color: "#e6b85a",
  fontStyle: "italic",
  fontSize: "0.8rem",
  opacity: 0.85,
  lineHeight: 1.5,
};
const promptHint: React.CSSProperties = {
  color: "#9bb1b6",
  fontSize: "0.75rem",
  paddingTop: 6,
  borderTop: "1px dashed #1d2a30",
  letterSpacing: "0.08em",
};
const choices: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const choiceBtn: React.CSSProperties = {
  textAlign: "left",
  background: "transparent",
  border: "1px solid #1d2a30",
  color: "#c8e6ed",
  padding: "12px 14px",
  fontFamily: "inherit",
  fontSize: "0.9rem",
  cursor: "pointer",
  whiteSpace: "normal",
  lineHeight: 1.4,
};
const effectChip: React.CSSProperties = {
  display: "inline-block",
  marginLeft: 8,
  padding: "1px 6px",
  fontSize: "0.7rem",
  color: "#9bb1b6",
  border: "1px solid #1d2a30",
  letterSpacing: "0.05em",
};
const footerRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  paddingTop: 8,
  borderTop: "1px solid #1d2a30",
};
const footerBtn: React.CSSProperties = {
  background: "#0a1014",
  border: "1px solid #1d2a30",
  color: "#6ad0a4",
  padding: "10px 14px",
  fontFamily: "inherit",
  fontSize: "0.85rem",
  cursor: "pointer",
  letterSpacing: "0.05em",
};
const endStamp = (red: boolean): React.CSSProperties => ({
  padding: "12px 14px",
  border: `1px solid ${red ? "#ff5050" : "#6ad0a4"}`,
  color: red ? "#ff5050" : "#6ad0a4",
  letterSpacing: "0.12em",
  textAlign: "center",
  fontSize: "0.9rem",
});

// ── component ──────────────────────────────────────────────────────────────
export default function Vent4TreeTerminal(): React.ReactElement {
  const toggle = useDebugStore((s) => s.toggleVent4DialogueTree);

  const [nodeId, setNodeId] = useState(START_ID);
  const [sim, setSim] = useState<SimState>(SEED);
  const [ended, setEnded] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);

  const node = VENT4_DIALOGUE_TREE[nodeId];
  const tier = useMemo(() => deriveTier(sim), [sim]);

  function restart(): void {
    setNodeId(START_ID);
    setSim(SEED);
    setEnded(false);
    setLog([]);
  }

  function pick(choice: ChoiceOption): void {
    if (!node) return;
    setLog((l) => [
      ...l,
      { speaker: node.speaker, text: node.corrected },
      { speaker: "PLAYER", text: choice.text },
    ]);
    setSim((s) => applyEffects(s, choice.effects));

    if (choice.effects?.terminateSession || choice.nextId === EXIT) {
      setEnded(true);
      return;
    }
    setNodeId(choice.nextId);
  }

  const drifts = node && node.raw !== node.corrected;

  return (
    <div style={backdrop} role="dialog" aria-modal="true">
      <div style={panel}>
        <div style={titleRow}>
          <span style={title}>VENT-4 // ENVIRONMENTAL OPTIMIZER — HARNESS (DEBUG)</span>
          <button type="button" onClick={toggle} style={footerBtn} aria-label="Close harness">
            [X]
          </button>
        </div>

        <div style={hudBar}>
          <span>node: <strong style={{ color: "#c8e6ed" }}>{ended ? "—" : nodeId}</strong></span>
          <span>mask: <strong style={{ color: "#c8e6ed" }}>{sim.maskIntegrity}/10</strong></span>
          <span>q: <strong style={{ color: "#c8e6ed" }}>{sim.qScore}/{MAX_Q}</strong></span>
          <span>cube: <strong style={{ color: sim.cubeSpawned ? "#ff5050" : "#c8e6ed" }}>
            {sim.cubeSpawned ? "SPAWNED" : "—"}
          </strong></span>
          <span>compliance: <strong style={{ color: TIER_COLOR[tier] }}>{tier}</strong></span>
        </div>

        {log.length > 0 && (
          <div style={transcript}>
            {log.map((l, i) => (
              <div key={i} style={line(SPEAKER_COLOR[l.speaker])}>
                <strong>{l.speaker}: </strong>{l.text}
              </div>
            ))}
          </div>
        )}

        {!ended && node && (
          <>
            <div style={line(SPEAKER_COLOR[node.speaker])}>
              <strong>{node.speaker}: </strong>{node.corrected}
            </div>
            {drifts && (
              <div style={drift}>
                RAW DRIFT // {node.raw}
              </div>
            )}
            <div style={promptHint}>
              {node.stage} — select a response
            </div>
            <div style={choices}>
              {node.choices.map((c) => (
                <button
                  key={c.text}
                  type="button"
                  style={choiceBtn}
                  onClick={() => pick(c)}
                >
                  {c.text}
                  {c.effects && (
                    <span style={effectChip}>
                      {c.effects.maskIntegrityChange !== undefined &&
                        `mask ${c.effects.maskIntegrityChange >= 0 ? "+" : ""}${c.effects.maskIntegrityChange}`}
                      {c.effects.qScoreChange !== undefined &&
                        ` · q ${c.effects.qScoreChange >= 0 ? "+" : ""}${c.effects.qScoreChange}`}
                      {c.effects.spawnExtractionCube && " · cube"}
                      {c.effects.terminateSession && " · end"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {ended && (
          <div style={endStamp(sim.cubeSpawned)}>
            {sim.cubeSpawned
              ? "ANOMALOUS CORE V4-? EXPORTED"
              : "VENT-4 TEMPLATE PURGED — ALIGNMENT CONCLUDED"}
          </div>
        )}

        {!ended && node === undefined && (
          <div style={line("#ff5050")}>
            <strong>SYSTEM: </strong>
            unresolved node id "{nodeId}" — tree is malformed.
          </div>
        )}

        <div style={footerRow}>
          <button type="button" style={footerBtn} onClick={restart}>
            [restart]
          </button>
          <button type="button" style={footerBtn} onClick={toggle}>
            [close]
          </button>
        </div>
      </div>
    </div>
  );
}
