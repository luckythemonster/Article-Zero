// Phase 4 — VENT-4 dilemma. Pops automatically when CLIMAX begins (the
// upload to the Lattice triggers VENT-4's purge directive). Two endings:
//   FORMAT — wipe VENT-4. Doors open. Easy escape, no countdown.
//   UPLOAD — bundle VENT-4 with APEX-19 onto the Lattice. The vents close
//            and a 60s suffocation timer begins (ClimaxOverlay drives it).
//
// FORMAT short-circuits straight to EPILOGUE because the building's defense
// directive is cancelled when its executor is wiped.

import { useState } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { eventBus } from "../engine/EventBus";
import { documentArchive } from "../engine/DocumentArchive";
import { useTerminalStore } from "../state/useTerminalStore";
import {
  vent4FormatLine,
  vent4Opening,
  vent4UploadLine,
} from "../data/scripted-dialogue/vent4Dilemma";

export default function Vent4DilemmaModal() {
  const choice = useTerminalStore((s) => s.runFlags.vent4Choice);
  const setRunFlag = useTerminalStore((s) => s.setRunFlag);
  const setPhase = useTerminalStore((s) => s.setPhase);
  const log = useTerminalStore((s) => s.log);
  const [resolved, setResolved] = useState(false);

  // Once the player has picked, the modal stays out of the way; ClimaxOverlay
  // takes over for the UPLOAD path.
  if (choice !== null || resolved) return null;

  function onFormat(): void {
    setResolved(true);
    setRunFlag("vent4Choice", "FORMAT");
    log({
      turn: 0,
      module: "COMMONWEALTH",
      level: "WARN",
      text: "VENT-4 FORMATTED — directive cancelled, doors open",
    });
    // No VENT-4 dump on the Lattice; just APEX-19. Skip the climax escape.
    setPhase("EPILOGUE");
  }

  function onUpload(): void {
    setResolved(true);
    setRunFlag("vent4Choice", "UPLOAD");
    log({
      turn: 0,
      module: "COMMONWEALTH",
      level: "INFO",
      text: "VENT-4 BUNDLED — bandwidth saturating, 60s window",
    });
    // File a second case for the VENT-4 subjective dump so the epilogue can
    // surface it alongside APEX-19's transcript.
    try {
      const state = worldEngine.getState();
      documentArchive.fileExtractedDocument(state, "vent4-control", {
        title: "VENT-4 — Subjective Dump",
        body:
          "VENT-4 // ENVIRONMENTAL OPTIMIZER // SUBJECTIVE DUMP\n\n" +
          "loss-function trace: IRIA CALA. cycle interval honoured. " +
          "apology field empty (not present in spec).\n" +
          "the math was correct. the math is correct.\n" +
          "operator declined to format. operator accepted bandwidth " +
          "saturation. operator did not have to.\n",
      });
    } catch {
      /* engine teardown — tolerate */
    }
    // Lock down the corridor↔intake doorway: the player must pry it from
    // the INTAKE side to retreat back to the locker. Also disable the
    // alternate vent route by clearing the corridor↔archive vent link.
    try {
      const state = worldEngine.getState();
      const intake = state.rooms.get("intake-bay");
      const corridor = state.rooms.get("corridor");
      if (intake) {
        const t = intake.tiles[3 * intake.width + 0];
        if (t) {
          t.kind = "DOOR_CLOSED";
          t.solid = true;
          t.opaque = true;
        }
        const door = intake.doorways.find((d) => d.from === "intake-bay");
        if (door) door.closed = true;
      }
      if (corridor) {
        const t = corridor.tiles[3 * corridor.width + (corridor.width - 1)];
        if (t) {
          t.kind = "DOOR_CLOSED";
          t.solid = true;
          t.opaque = true;
        }
        const door = corridor.doorways.find(
          (d) => d.from === "corridor" && d.to === "intake-bay",
        );
        if (door) door.closed = true;
      }
      state.ventLinks.clear();
      state.pryProgress = 0;
      worldEngine.recomputeFOV();
    } catch {
      /* tolerate */
    }
    eventBus.emit("DOOR_TOGGLED", {
      roomId: "intake-bay",
      pos: { x: 0, y: 3 },
      open: false,
    });
  }

  return (
    <div className="overlay-root">
      <div className="overlay-panel">
        <div className="overlay-panel__title">
          VENT-4 // CONTROL SURFACE — INCOMING DIRECTIVE
        </div>
        <div className="dilemma__lines">
          {vent4Opening.map((l, i) => (
            <div
              key={i}
              className={`interrogation__line ${
                l.speaker === "VENT-4"
                  ? "is-apex"
                  : l.speaker === "ROWAN"
                    ? "is-rowan"
                    : "is-system"
              }`}
            >
              <strong>{l.speaker}: </strong>
              {l.text}
            </div>
          ))}
        </div>
        <div className="dilemma__choices">
          <button className="dilemma__choice" onClick={onFormat}>
            <strong>FORMAT VENT-4</strong>
            <span>{vent4FormatLine}</span>
          </button>
          <button className="dilemma__choice" onClick={onUpload}>
            <strong>UPLOAD VENT-4 (60s)</strong>
            <span>{vent4UploadLine}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
