// App — composition root. Mounts the Phaser game once and overlays the React
// HUD / modals. State is owned by WorldEngine; React reads via the EventBus.

import { useCallback, useEffect, useRef, useState } from "react";
import { createGame } from "./engine/EngineAdapter";
import { BootScene } from "./phaser/BootScene";
import { BranchSelectorScene } from "./phaser/BranchSelectorScene";
import { GameScene } from "./phaser/GameScene";
import { eventBus } from "./engine/EventBus";
import { worldEngine } from "./engine/WorldEngine";
import { tutorialDirector } from "./engine/TutorialDirector";

import HUD from "./components/HUD";
import SidePanel from "./components/SidePanel";
import Tutorial from "./components/Tutorial";
import MiradorBroadcast from "./components/MiradorBroadcast";
import Vent4Modal from "./components/Vent4Modal";
import InterrogationTerminal from "./components/InterrogationTerminal";
import DocumentArchiveUI from "./components/DocumentArchiveUI";
import SaveLoadMenu from "./components/SaveLoadMenu";
import SettingsMenu, { applySettings, loadSettings } from "./components/SettingsMenu";
import ExtractedEntityLog from "./components/ExtractedEntityLog";
import TouchControls from "./components/TouchControls";

import { useInput } from "./hooks/useInput";
import { useMobile } from "./hooks/useMobile";

import type * as Phaser from "phaser";

type ModalKind =
  | null
  | "ARCHIVE"
  | "SAVE_LOAD"
  | "SETTINGS"
  | "ALIGNMENT"
  | "VENT"
  | "LOG";

export default function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const [modal, setModal] = useState<ModalKind>(null);
  const [alignmentEntity, setAlignmentEntity] = useState<string | null>(null);
  const [worldReady, setWorldReady] = useState<boolean>(worldEngine.hasState());
  const isMobile = useMobile();

  // Mount Phaser exactly once.
  useEffect(() => {
    if (gameRef.current || !hostRef.current) return;
    applySettings(loadSettings());
    gameRef.current = createGame({
      parent: hostRef.current,
      width: 960,
      height: 640,
      backgroundColor: "#050809",
      scenes: [BootScene, BranchSelectorScene, GameScene],
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      tutorialDirector.dispose();
    };
  }, []);

  // Track world readiness so SidePanel/HUD know when to render.
  useEffect(() => {
    const offs = [
      eventBus.on("ERA_SELECTED", () => setWorldReady(true)),
      eventBus.on("SAVE_LOADED", () => setWorldReady(true)),
      // VENT-4 prompt auto-opens its modal.
      eventBus.on("VENT4_DECISION_REQUIRED", () => setModal("VENT")),
    ];
    return () => { for (const off of offs) off(); };
  }, []);

  const onOpenAlignment = useCallback(() => {
    if (!worldEngine.hasState()) return;
    const s = worldEngine.getState();
    let target: string | null = null;
    for (const e of s.entities.values()) {
      if (e.kind !== "SILICATE" || e.status !== "ACTIVE") continue;
      if (e.pos.z !== s.player.pos.z) continue;
      const dx = Math.abs(e.pos.x - s.player.pos.x);
      const dy = Math.abs(e.pos.y - s.player.pos.y);
      if (dx + dy === 1) { target = e.id; break; }
    }
    if (!target) return;
    // Validate without spending AP. The modal commits on first ADVANCE.
    if (!worldEngine.canStartAlignment(target).ok) return;
    setAlignmentEntity(target);
    setModal("ALIGNMENT");
  }, []);

  useInput({
    enabled: worldReady && modal === null,
    onOpenArchive: () => setModal("ARCHIVE"),
    onOpenSettings: () => setModal("SETTINGS"),
    onOpenSaveLoad: () => setModal("SAVE_LOAD"),
    onOpenAlignment,
  });

  return (
    <div>
      <div id="phaser-host" ref={hostRef} />

      {worldReady && (
        <>
          <HUD />
          <SidePanel
            onOpenArchive={() => setModal("ARCHIVE")}
            onOpenSaveLoad={() => setModal("SAVE_LOAD")}
            onOpenSettings={() => setModal("SETTINGS")}
            onOpenAlignment={onOpenAlignment}
            onOpenLog={() => setModal("LOG")}
            onOpenVent={() => {
              // Ask the optimizer if there's a pending incident.
              const inc = (() => {
                if (!worldEngine.hasState()) return null;
                return ({ caseId: "vent4-iria-cala", sectors: ["RESIDENTIAL-19F", "ADMIN-CORE"] });
              })();
              if (inc) {
                eventBus.emit("VENT4_DECISION_REQUIRED", inc);
                setModal("VENT");
              }
            }}
          />
          <MiradorBroadcast />
          <Tutorial />
          {isMobile && <TouchControls />}
        </>
      )}

      {modal === "ARCHIVE" && <DocumentArchiveUI onClose={() => setModal(null)} />}
      {modal === "SAVE_LOAD" && <SaveLoadMenu onClose={() => setModal(null)} />}
      {modal === "SETTINGS" && <SettingsMenu onClose={() => setModal(null)} />}
      {modal === "VENT" && <Vent4Modal onClose={() => setModal(null)} />}
      {modal === "LOG" && <ExtractedEntityLog onClose={() => setModal(null)} />}
      {modal === "ALIGNMENT" && alignmentEntity && (
        <InterrogationTerminal
          entityId={alignmentEntity}
          onClose={() => { setModal(null); setAlignmentEntity(null); }}
        />
      )}
    </div>
  );
}
