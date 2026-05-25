import { useEffect, useState } from "react";
import { useTerminalStore } from "../state/useTerminalStore";
import { applySettings, loadSettings } from "./settings";
import StatusBar from "./StatusBar";
import AuditLog from "./AuditLog";
import CommandLine from "./CommandLine";
import ModuleSelector from "./ModuleSelector";
import ArchivistIntro from "./ArchivistIntro";
import { PhaserCanvas } from "./PhaserCanvas";
import InterrogationTerminal from "../components/InterrogationTerminal";
import EnforcerInterrogationModal from "../components/EnforcerInterrogationModal";
import DisputedRecordsUI from "../components/DisputedRecordsUI";
import Vent4DilemmaModal from "../components/Vent4DilemmaModal";
import ClimaxOverlay from "../components/ClimaxOverlay";
import AuditLockdown from "../components/AuditLockdown";
import ArchiveEpilogue from "../components/ArchiveEpilogue";
import DebugOverlay from "../components/DebugOverlay";
import SpriteGallery from "../components/SpriteGallery";
import InventoryOverlay from "../components/InventoryOverlay";
import ExecuteResetModal from "../components/ExecuteResetModal";
import FullscreenFlash from "./FullscreenFlash";
import TitleScreen from "./TitleScreen";

export default function TerminalShell() {
  const [started, setStarted] = useState(false);
  const activeModule = useTerminalStore((s) => s.activeModuleId);
  const phase = useTerminalStore((s) => s.phase);

  useEffect(() => {
    applySettings(loadSettings());
    // Persisted phase may be mid-run with no live engine (page reload). The
    // Phaser canvas needs an engine, the modals need DocumentArchive cases —
    // none of that survives a refresh. Snap back to FRAME and let the player
    // re-open the file.
    // Mid-run state never survives a page reload — the engine, the Phaser
    // scene, and DocumentArchive all reset to empty. Snap back to FRAME and
    // make the player re-open the file. EPILOGUE is fine to resume because
    // it's pure UI driven by persisted runFlags.
    const term = useTerminalStore.getState();
    if (term.phase !== "FRAME" && term.phase !== "EPILOGUE") {
      term.resetRun();
      term.setActiveModule(null);
      term.setPhase("FRAME");
    }
    // NOTE: the eventBridge is installed inside PhaserCanvas, not here — its
    // listeners must be registered *after* PhaserCanvas's eventBus.clear() on
    // mount, or they get wiped the moment a module loads.
  }, []);

  useEffect(() => {
    const lattice = phase === "FRAME" || phase === "EPILOGUE";
    document.body.classList.toggle("theme-lattice", lattice);
    document.body.classList.toggle("theme-commonwealth", !lattice);
    // Full-screen blocking modals (no touch controls on screen) get to use the
    // whole canvas area instead of reserving the bottom band for the D-pad.
    const fullscreenModal =
      phase === "ALIGNMENT" || phase === "INTERROGATION" || phase === "FORGERY";
    document.body.classList.toggle("phase-fullscreen-modal", fullscreenModal);
  }, [phase]);

  if (!started) {
    return <TitleScreen onStart={() => setStarted(true)} />;
  }

  return (
    <div className="shell-grid">
      <StatusBar />
      <main className="shell-main">
        {phase === "FRAME" ? (
          <ArchivistIntro />
        ) : phase === "EPILOGUE" ? (
          <ArchiveEpilogue />
        ) : activeModule ? (
          <PhaserCanvas moduleId={activeModule}>
            {phase === "ALIGNMENT" && <InterrogationTerminal />}
            {phase === "INTERROGATION" && <EnforcerInterrogationModal />}
            {phase === "FORGERY" && <DisputedRecordsUI />}
            {phase === "CLIMAX" && (
              <>
                <Vent4DilemmaModal />
                <ClimaxOverlay />
              </>
            )}
            {(phase === "FLOOR" || phase === "CLIMAX") && <InventoryOverlay />}
            <ExecuteResetModal />
            <AuditLockdown />
          </PhaserCanvas>
        ) : (
          <ModuleSelector />
        )}
      </main>
      <footer className="shell-footer">
        <AuditLog />
        <CommandLine />
      </footer>
      <DebugOverlay />
      <SpriteGallery />
      <FullscreenFlash />
    </div>
  );
}
