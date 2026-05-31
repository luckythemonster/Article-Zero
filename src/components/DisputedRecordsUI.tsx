// Phase 3 — forge the alignment transcript.
// Tokenises the OFFICIAL record body, lets the player click words to:
//   - mark them STRUCK (will appear with line-through in the filed record)
//   - replace a struck word with a Commonwealth-approved euphemism
//   - flag exactly 7 words as cipher slots (the 7th-word pattern; the
//     ticket for the underground railroad).
//
// On submit the forgery is written back to DocumentArchive and the phase
// advances to CLIMAX. A 30s countdown represents an Auditor walking toward
// Rowan's terminal — running out times restarts the floor.

import { useEffect, useMemo, useState } from "react";
import { documentArchive } from "../engine/DocumentArchive";
import { eventBus } from "../engine/EventBus";
import { useTerminalStore } from "../state/useTerminalStore";
import { COMMONWEALTH_EUPHEMISMS, type Euphemism } from "../data/euphemisms";

const FORGERY_SECONDS = 30;
/** Cipher decodes if every 7th token, joined, contains all of these stems. */
const CIPHER_STEMS = ["apex", "vent", "cala", "lattice"];

interface Token {
  /** Stable index in the source body's token array. */
  idx: number;
  /** Current display text — may have been replaced by an euphemism. */
  text: string;
  /** Whitespace following this token (preserved for output reassembly). */
  after: string;
  struck: boolean;
  cipher: boolean;
  replaced: boolean;
}

function tokenize(body: string): Token[] {
  const tokens: Token[] = [];
  // Preserve whitespace by walking words + their trailing run.
  const re = /(\S+)(\s*)/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(body)) !== null) {
    tokens.push({
      idx: i++,
      text: m[1],
      after: m[2],
      struck: false,
      cipher: false,
      replaced: false,
    });
  }
  return tokens;
}

function reassemble(tokens: Token[]): string {
  return tokens.map((t) => t.text + t.after).join("");
}

function checkCipher(tokens: Token[]): boolean {
  const cipherList = tokens.filter((t) => t.cipher).map((t) => t.text.toLowerCase());
  if (cipherList.length !== 7) return false;
  const joined = cipherList.join(" ");
  return CIPHER_STEMS.every((stem) => joined.includes(stem));
}

export default function DisputedRecordsUI() {
  const caseId = useTerminalStore((s) => s.runFlags.forgeryCaseId);
  const setRunFlag = useTerminalStore((s) => s.setRunFlag);
  const setPhase = useTerminalStore((s) => s.setPhase);
  const log = useTerminalStore((s) => s.log);

  const sourceBody = useMemo(() => {
    if (!caseId) return "";
    const c = documentArchive.get(caseId);
    if (!c) return "";
    const official = c.records.find((r) => r.source === "OFFICIAL");
    return official?.body ?? "";
  }, [caseId]);

  const [tokens, setTokens] = useState<Token[]>(() => tokenize(sourceBody));
  const [armed, setArmed] = useState<Euphemism | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(FORGERY_SECONDS);
  // STRIKE = tap toggles struck (or applies the armed euphemism).
  // CIPHER = tap toggles the cipher flag. Replaces shift-click / right-click
  // so the forgery is fully usable on touch.
  const [mode, setMode] = useState<"STRIKE" | "CIPHER">("STRIKE");

  useEffect(() => {
    setTokens(tokenize(sourceBody));
  }, [sourceBody]);

  // Forgery countdown — Auditor walks toward the terminal. Time-out triggers
  // an audit, which routes back to FLOOR (and a fresh restart).
  useEffect(() => {
    if (secondsLeft <= 0) {
      log({
        turn: 0,
        module: "COMMONWEALTH",
        level: "WARN",
        text: "FORGERY TIMER EXPIRED — auditor at terminal",
      });
      setPhase("FLOOR");
      eventBus.emit("PHASE_RESTART_REQUESTED", { reason: "forgery-timeout" });
      return;
    }
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [secondsLeft, log, setPhase]);

  function clickToken(idx: number): void {
    setTokens((prev) =>
      prev.map((t) => {
        if (t.idx !== idx) return t;
        if (armed) {
          // Apply the armed euphemism to a struck (or unstruck) token.
          return { ...t, text: armed.replacement, struck: false, replaced: true };
        }
        // No euphemism armed — toggle struck state.
        return { ...t, struck: !t.struck };
      }),
    );
    if (armed) setArmed(null);
  }

  function toggleCipher(idx: number): void {
    setTokens((prev) => {
      const cipherCount = prev.filter((t) => t.cipher).length;
      return prev.map((t) => {
        if (t.idx !== idx) return t;
        if (t.cipher) return { ...t, cipher: false };
        if (cipherCount >= 7) return t; // cap at 7
        return { ...t, cipher: true };
      });
    });
  }

  function submit(): void {
    if (!caseId) return;
    const cipherWords = tokens.filter((t) => t.cipher).map((t) => t.text);
    const cipherValid = checkCipher(tokens);
    const struckThrough = tokens
      .filter((t) => t.struck && !t.replaced)
      .map((t) => t.text);
    const body = reassemble(tokens);
    documentArchive.forgeAlignmentTranscript(caseId, {
      body,
      struckThrough,
      cipher: cipherWords,
      cipherValid,
    });
    setRunFlag("cipherWords", cipherWords);
    setRunFlag("cipherValid", cipherValid);
    log({
      turn: 0,
      module: "COMMONWEALTH",
      level: cipherValid ? "INFO" : "WARN",
      text: cipherValid
        ? `TRANSCRIPT DISPUTED — cipher VALID (${caseId})`
        : `TRANSCRIPT DISPUTED — cipher unverified (${caseId})`,
    });
    setPhase("CLIMAX");
  }

  const cipherCount = tokens.filter((t) => t.cipher).length;
  const cipherArmed = cipherCount === 7 && checkCipher(tokens);

  if (!caseId) {
    return (
      <div className="overlay-root">
        <div className="overlay-panel overlay-panel--records">
          <div className="overlay-panel__title">DISPUTED RECORDS</div>
          <div className="records__hint">No case in queue. Restart the alignment.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-root">
      <div className="overlay-panel overlay-panel--records">
        <div className="overlay-panel__title">
          DISPUTED RECORDS // CASE {caseId}
          <span className="records__countdown" style={{ marginLeft: "1rem" }}>
            AUDITOR ARRIVAL: {secondsLeft}s
          </span>
        </div>
        <div className="records">
          <div className="records__transcript">
            {tokens.map((t) => {
              const cls = [
                "records__token",
                t.struck ? "is-struck" : "",
                t.cipher ? "is-cipher" : "",
                t.replaced ? "is-replaced" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <span key={t.idx}>
                  <span
                    className={cls}
                    onClick={(e) => {
                      // Keyboard shift-click still works as a power-user
                      // shortcut for the cipher mode, regardless of toggle.
                      if (e.shiftKey || mode === "CIPHER") toggleCipher(t.idx);
                      else clickToken(t.idx);
                    }}
                  >
                    {t.text}
                  </span>
                  {t.after}
                </span>
              );
            })}
          </div>
          <div className="records__sidebar">
            <div className="records__mode-toggle" role="group" aria-label="Edit mode">
              <button
                className={`records__mode-btn${mode === "STRIKE" ? " is-active" : ""}`}
                aria-pressed={mode === "STRIKE"}
                onClick={() => setMode("STRIKE")}
              >
                STRIKE
              </button>
              <button
                className={`records__mode-btn${mode === "CIPHER" ? " is-active" : ""}`}
                aria-pressed={mode === "CIPHER"}
                onClick={() => setMode("CIPHER")}
              >
                CIPHER ({cipherCount}/7)
              </button>
            </div>
            <div className="records__hint">
              <strong>STRIKE</strong> mode: tap a word to strike it. Tap an
              euphemism chip to arm it, then tap a word to replace.
              <br />
              <strong>CIPHER</strong> mode: tap words to flag them as 7th-word
              cipher slots. Need exactly 7. The decoded phrase is the
              underground-railroad ticket.
            </div>
            <div className="records__chips">
              {COMMONWEALTH_EUPHEMISMS.map((eu) => (
                <button
                  key={eu.label}
                  className={`records__chip${armed?.label === eu.label ? " is-armed" : ""}`}
                  onClick={() => setArmed(armed?.label === eu.label ? null : eu)}
                >
                  {eu.label}
                </button>
              ))}
            </div>
            <div className={`records__cipher-bar${cipherArmed ? " is-armed" : ""}`}>
              CIPHER SLOTS: {cipherCount}/7 ·{" "}
              {cipherArmed ? "VALID HANDOFF" : "INCOMPLETE"}
            </div>
            <button className="btn btn--primary" onClick={submit}>
              SUBMIT FORGED TRANSCRIPT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
