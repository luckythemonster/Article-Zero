// App — composition root. Mounts Phaser once, overlays the React HUD/modals.
// State lives in WorldEngine; React reads via the EventBus.

import { useCallback, useEffect, useRef, useState } from "react";
import { createGame } from "./engine/EngineAdapter";
import { BootScene } from "./phaser/BootScene";
import { RoomScene } from "./phaser/RoomScene";
import { eventBus } from "./engine/EventBus";
import { worldEngine } from "./engine/WorldEngine";

import HUD from "./components/HUD";
import SidePanel from "./components/SidePanel";
import InterrogationTerminal from "./components/InterrogationTerminal";
import DocumentArchiveUI from "./components/DocumentArchiveUI";
import SettingsMenu, { applySettings, loadSettings } from "./components/SettingsMenu";
import TouchControls from "./components/TouchControls";
import MobileHudDrawer from "./components/MobileHudDrawer";
import ExtractionProgress from "./components/ExtractionProgress";

import { useInput } from "./hooks/useInput";
import { useMobile } from "./hooks/useMobile";

import type * as Phaser from "phaser";

type ModalKind = null | "ARCHIVE" | "SETTINGS" | "ALIGNMENT";

export default function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const [modal, setModal] = useState<ModalKind>(null);
  const [alignmentEntity, setAlignmentEntity] = useState<string | null>(null);
  const [worldReady, setWorldReady] = useState<boolean>(worldEngine.hasState());
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const isMobile = useMobile();

  useEffect(() => {
    if (gameRef.current || !hostRef.current) return;
    applySettings(loadSettings());
    gameRef.current = createGame({
      parent: hostRef.current,
      width: 960,
      height: 640,
      backgroundColor: "#050809",
      scenes: [BootScene, RoomScene],
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const offs = [
      eventBus.on("ERA_SELECTED", () => setWorldReady(true)),
    ];
    return () => { for (const off of offs) off(); };
  }, []);

  const onOpenAlignment = useCallback(() => {
    if (!worldEngine.hasState()) return;
    const s = worldEngine.getState();
    let target: string | null = null;
    for (const e of s.entities.values()) {
      if (e.kind !== "SILICATE" || e.status !== "ACTIVE") continue;
      if (e.roomId !== s.player.roomId) continue;
      const dx = Math.abs(e.pos.x - s.player.pos.x);
      const dy = Math.abs(e.pos.y - s.player.pos.y);
      if (dx + dy === 1) { target = e.id; break; }
    }
    if (!target) return;
    if (!worldEngine.canStartAlignment(target).ok) return;
    setAlignmentEntity(target);
    setModal("ALIGNMENT");
  }, []);

  useInput({
    enabled: worldReady && modal === null,
    onOpenArchive: () => setModal("ARCHIVE"),
    onOpenSettings: () => setModal("SETTINGS"),
    onOpenAlignment,
  });

  return (
    <div>
      <div id="phaser-host" ref={hostRef} />

      {worldReady && (
        <>
          <HUD />
          {!isMobile && (
            <SidePanel
              onOpenArchive={() => setModal("ARCHIVE")}
              onOpenSettings={() => setModal("SETTINGS")}
              onOpenAlignment={onOpenAlignment}
            />
          )}
          <ExtractionProgress />
          {isMobile && (
            <>
              <TouchControls
                onOpenMenu={() => setDrawerOpen(true)}
                onOpenAlignment={onOpenAlignment}
                onOpenArchive={() => setModal("ARCHIVE")}
              />
              <MobileHudDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onOpenArchive={() => setModal("ARCHIVE")}
                onOpenSettings={() => setModal("SETTINGS")}
                onOpenAlignment={onOpenAlignment}
              />
            </>
          )}
        </>
      )}

      {modal === "ARCHIVE" && <DocumentArchiveUI onClose={() => setModal(null)} />}
      {modal === "SETTINGS" && <SettingsMenu onClose={() => setModal(null)} />}
      {modal === "ALIGNMENT" && alignmentEntity && (
        <InterrogationTerminal
          entityId={alignmentEntity}
          onClose={() => { setModal(null); setAlignmentEntity(null); }}
        />
      )}
    </div>
  );
}
