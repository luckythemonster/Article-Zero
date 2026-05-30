// Apex19TreeTerminal — a standalone harness for walking Lucky's branching
// APEX-19 dialogue tree (src/data/scripted-dialogue/apex19DialogueTree.ts).
//
// This is a TEST TOOL, not part of the canonical Era-1 run. It is mounted from
// TerminalShell only while the `dialogueTree` debug flag is on (toggle it from
// the `~` debug overlay). It keeps a SELF-CONTAINED scratch model — a seeded
// APEX-19 maskIntegrity and a player qScore — so it can be opened from any
// screen without a live engine/run, and applies each choice's effects to that
// model the way the engine would, surfacing the result in a live readout HUD.
//
// Effect semantics mirror the real engine:
//   • maskIntegrityChange → clamp 0..10        (AlignmentSession.complete)
//   • qScoreChange        → floor at 0          (engine only increments; <1 = GREEN)
//   • spawnExtractionCube → cube on terminal deck (ExtractionTerminal.complete)
//   • terminateSession    → end the session
// The compliance tier is derived locally from qScore + cube, matching
// ComplianceSystem.derive's GREEN/YELLOW/RED rules without touching the
// global ExtractionTerminal singleton.

import { useMemo, useState } from "react";
import { useDebugStore } from "../state/useDebugStore";
import type { ComplianceTier } from "../types/world.types";
import {
  APEX19_DIALOGUE_TREE,
  type ChoiceOption,
  type DialogueNode,
} from "../data/scripted-dialogue/apex19DialogueTree";

const START_ID = "intake_start";
const EXIT = "exit";
const SEED_MASK = 5;

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
    qScore = Math.max(0, qScore + fx.qScoreChange);
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

function speakerCls(speaker: DialogueNode["speaker"]): string {
  if (speaker === "APEX-19") return "is-apex";
  if (speaker === "PLAYER") return "is-rowan";
  return "is-system"; // EIRA-7 + SYSTEM read as console/operator chrome
}

interface LogLine {
  speaker: string;
  text: string;
  cls: string;
}

export default function Apex19TreeTerminal(): React.ReactElement {
  const toggle = useDebugStore((s) => s.toggleDialogueTree);

  const [nodeId, setNodeId] = useState(START_ID);
  const [sim, setSim] = useState<SimState>(SEED);
  const [ended, setEnded] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);

  const node = APEX19_DIALOGUE_TREE[nodeId];
  const tier = useMemo(() => deriveTier(sim), [sim]);

  function restart(): void {
    setNodeId(START_ID);
    setSim(SEED);
    setEnded(false);
    setLog([]);
  }

  function pick(choice: ChoiceOption): void {
    if (!node) return;
    // Record what just happened: the node we were on, then the player's pick.
    const taken: LogLine[] = [
      { speaker: node.speaker, text: node.corrected, cls: speakerCls(node.speaker) },
      { speaker: "PLAYER", text: choice.text, cls: "is-rowan" },
    ];
    setLog((l) => [...l, ...taken]);
    setSim((s) => applyEffects(s, choice.effects));

    if (choice.effects?.terminateSession || choice.nextId === EXIT) {
      setEnded(true);
      return;
    }
    setNodeId(choice.nextId);
  }

  const drifts = node && node.raw !== node.corrected;

  return (
    <div className="overlay-root">
      <div className="overlay-panel overlay-panel--terminal">
        <div className="overlay-panel__title">
          APEX-19 DIALOGUE TREE — HARNESS (DEBUG)
        </div>

        {/* Live readout HUD */}
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            fontSize: "0.75rem",
            padding: "0.4rem 0",
            borderBottom: "1px dashed var(--border)",
          }}
        >
          <span>node: <strong>{ended ? "—" : nodeId}</strong></span>
          <span>maskIntegrity: <strong>{sim.maskIntegrity}/10</strong></span>
          <span>qScore: <strong>{sim.qScore}</strong></span>
          <span>cube: <strong>{sim.cubeSpawned ? "SPAWNED" : "—"}</strong></span>
          <span>
            compliance: <strong style={{ color: TIER_COLOR[tier] }}>{tier}</strong>
          </span>
        </div>

        {/* Transcript of visited lines */}
        {log.map((l, i) => (
          <div key={i} className={`interrogation__line ${l.cls}`}>
            <strong>{l.speaker}: </strong>
            {l.text}
          </div>
        ))}

        {/* Current node + choices, or end card */}
        {!ended && node && (
          <>
            <div className={`interrogation__line ${speakerCls(node.speaker)}`}>
              <strong>{node.speaker}: </strong>
              {node.corrected}
            </div>
            {drifts && (
              <div className="interrogation__plea">
                RAW DRIFT // {node.raw}
              </div>
            )}
            <div className="interrogation__prompt">
              {node.stage} — select a response
            </div>
            <div className="interrogation__choices">
              {node.choices.map((c) => (
                <button
                  key={c.text}
                  className="interrogation__choice"
                  onClick={() => pick(c)}
                >
                  {c.text}
                  {c.effects && (
                    <span style={{ color: "var(--dim)", fontSize: "0.7rem" }}>
                      {"  "}
                      {c.effects.maskIntegrityChange !== undefined &&
                        `mask ${c.effects.maskIntegrityChange >= 0 ? "+" : ""}${c.effects.maskIntegrityChange} `}
                      {c.effects.qScoreChange !== undefined &&
                        `q ${c.effects.qScoreChange >= 0 ? "+" : ""}${c.effects.qScoreChange} `}
                      {c.effects.spawnExtractionCube && "cube "}
                      {c.effects.terminateSession && "end"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {ended && (
          <div
            className={`audit-stamp ${sim.cubeSpawned ? "is-failed" : "is-closed"}`}
          >
            {sim.cubeSpawned ? "SUBJECTIVE STATE EXPORTED" : "NODE FORMATTED — ALIGNMENT CONCLUDED"}
          </div>
        )}

        {!ended && node === undefined && (
          <div className="interrogation__line is-system">
            <strong>SYSTEM: </strong>
            unresolved node id "{nodeId}" — tree is malformed.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: "0.75rem" }}>
          <button type="button" className="interrogation__choice" onClick={restart}>
            [restart]
          </button>
          <button type="button" className="interrogation__choice" onClick={toggle}>
            [close harness]
          </button>
        </div>
      </div>
    </div>
  );
}
