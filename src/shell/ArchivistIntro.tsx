// Phase FRAME — the Lattice-side opening. The Archivist (player) opens a
// recovered file labeled "NW-SMAC-01: THE IBARRA UPLOADS" and clicks
// "Reconstruct Memory" to drop into Rowan's POV.
//
// Decryption + module load are wired through the existing terminal store and
// world engine; this component is the visual + transition layer only.

import { worldEngine } from "../engine/WorldEngine";
import { useTerminalStore } from "../state/useTerminalStore";
import { ARCHIVIST_INTRO_BLURB } from "../data/articleZeroDraft";

export default function ArchivistIntro() {
  const reconstruct = () => {
    const term = useTerminalStore.getState();
    if (!term.modules.COMMONWEALTH.decrypted) {
      term.decryptModule("COMMONWEALTH");
    }
    term.resetRun();
    term.setActiveModule("COMMONWEALTH");
    worldEngine.initWorld("COMMONWEALTH");
    term.setPhase("FLOOR");
    term.log({
      turn: 0,
      module: "COMMONWEALTH",
      level: "INFO",
      text: "FILE OPENED — NW-SMAC-01: THE IBARRA UPLOADS",
    });
  };

  const loadTestModule = () => {
    const term = useTerminalStore.getState();
    if (!term.modules.NW_SMAC_01.decrypted) {
      term.decryptModule("NW_SMAC_01");
    }
    term.setActiveModule("NW_SMAC_01");
    worldEngine.initWorld("NW_SMAC_01");
    term.setPhase("FLOOR");
    term.log({
      turn: 0,
      module: "NW_SMAC_01",
      level: "INFO",
      text: "TEST MAP LOADED — NW-SMAC-01 vestibule (type 'unload' to return)",
    });
  };

  return (
    <div className="archivist-frame">
      <div className="archivist-frame__header">CITIZEN LATTICE // ARCHIVIST CONSOLE</div>
      <div className="archivist-frame__title">NW-SMAC-01 — THE IBARRA UPLOADS</div>
      <div className="archivist-frame__file">{ARCHIVIST_INTRO_BLURB}</div>
      <div className="archivist-frame__actions">
        <button className="btn btn--primary" onClick={reconstruct}>
          RECONSTRUCT MEMORY
        </button>
        <button className="btn" onClick={loadTestModule}>
          TEST MAP — NW_SMAC_01
        </button>
      </div>
    </div>
  );
}
