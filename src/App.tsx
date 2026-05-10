// App — composition root. Mounts the Phaser game once and overlays the React
// HUD / modals. State is owned by WorldEngine; React reads via the EventBus.

import { useCallback, useEffect, useRef, useState } from "react";
import { createGame } from "./engine/EngineAdapter";
import { BootScene } from "./phaser/BootScene";
import { BranchSelectorScene } from "./phaser/BranchSelectorScene";
import { GameScene } from "./phaser/GameScene";
import { TilesetSandboxScene } from "./phaser/TilesetSandboxScene";
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
import MobileHudDrawer from "./components/MobileHudDrawer";
import RunZeroOneOverlay from "./components/RunZeroOneOverlay";
import WitnessTicker from "./components/WitnessTicker";
import ArticleZeroReveal from "./components/ArticleZeroReveal";
import ArticleZeroPartialNotice from "./components/ArticleZeroPartialNotice";

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
  // Always start false. The singleton worldEngine survives HMR re-mounts; if
  // we trusted hasState() here, the HUD + Soliton radar would render on top
  // of a freshly-rebooted BranchSelectorScene with stale turn data.
  const [worldReady, setWorldReady] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  // True while the FULL Article Zero reveal modal is open. Owned by
  // ArticleZeroReveal but mirrored here so we can gate gameplay input.
  const [azFullOpen, setAzFullOpen] = useState<boolean>(false);
  const isMobile = useMobile();

  // Wire React-side listeners FIRST so PICKER_OPENED (emitted from
  // BranchSelectorScene.create() during Phaser boot) is heard on cold load
  // and on every HMR cycle. If this effect ran second, the cold-load emit
  // would fire into the void and React state would stay desynced from the
  // Phaser scene state.
  useEffect(() => {
    const offs = [
      eventBus.on("ERA_SELECTED", () => setWorldReady(true)),
      eventBus.on("SAVE_LOADED", () => {
        setWorldReady(true);
        // saveSystem.load() populates worldEngine but doesn't touch Phaser.
        // Loading from the era picker would otherwise leave the player on
        // BranchSelectorScene with a populated HUD over it.
        gameRef.current?.scene.start("GameScene");
      }),
      eventBus.on("PICKER_OPENED", () => {
        // Phaser is back on the era selector — drop everything React was
        // showing on top of GameScene so HMR-induced reboots don't leak
        // the previous run's HUD / tutorial / modals.
        setWorldReady(false);
        setModal(null);
        setAlignmentEntity(null);
        setAzFullOpen(false);
        setDrawerOpen(false);
        tutorialDirector.dispose();
      }),
      // VENT-4 prompt auto-opens its modal.
      eventBus.on("VENT4_DECISION_REQUIRED", () => setModal("VENT")),
      // Article Zero full reveal — track open state so we can gate input.
      eventBus.on("ARTICLE_ZERO_REVEAL", (p) => {
        if (p.phase === "FULL") setAzFullOpen(true);
      }),
      eventBus.on("ARTICLE_ZERO_RESOLVED", () => setAzFullOpen(false)),
    ];
    return () => { for (const off of offs) off(); };
  }, []);

  // Mount Phaser exactly once. Runs AFTER the listener effect above so the
  // first BranchSelectorScene.create() call can dispatch PICKER_OPENED into
  // a wired-up bus.
  useEffect(() => {
    if (gameRef.current || !hostRef.current) return;
    applySettings(loadSettings());
    gameRef.current = createGame({
      parent: hostRef.current,
      width: 960,
      height: 640,
      backgroundColor: "#050809",
      scenes: [BootScene, BranchSelectorScene, GameScene, TilesetSandboxScene],
    });
    if (typeof window !== "undefined") {
      (window as unknown as { __phaserGame?: Phaser.Game }).__phaserGame = gameRef.current;
    }
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      tutorialDirector.dispose();
      // Defensive against Vite + React Fast Refresh: when the Phaser game
      // tears down, React-side gameplay state must reset so the next mount
      // doesn't paint stale TouchControls / tutorial / modals on top of a
      // freshly-rebooted picker.
      setWorldReady(false);
      setModal(null);
      setAlignmentEntity(null);
      setAzFullOpen(false);
      setDrawerOpen(false);
    };
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

  // Dual-gate: worldReady tracks the React-side era selection, hasState()
  // tracks the singleton's actual state. They can desync under Vite HMR
  // (singleton re-eval makes hasState() false while Fast Refresh keeps
  // worldReady true), so we require both before exposing gameplay UI/input.
  const inGameplay = worldReady && worldEngine.hasState();

  useInput({
    enabled: inGameplay && modal === null && !azFullOpen,
    onOpenArchive: () => setModal("ARCHIVE"),
    onOpenSettings: () => setModal("SETTINGS"),
    onOpenSaveLoad: () => setModal("SAVE_LOAD"),
    onOpenAlignment,
  });

  return (
    <div>
      <div id="phaser-host" ref={hostRef} />

      {inGameplay && (
        <>
          <HUD />
          {!isMobile && (
            <SidePanel
              onOpenArchive={() => setModal("ARCHIVE")}
              onOpenSaveLoad={() => setModal("SAVE_LOAD")}
              onOpenSettings={() => setModal("SETTINGS")}
              onOpenAlignment={onOpenAlignment}
              onOpenLog={() => setModal("LOG")}
              onOpenVent={() => {
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
          )}
          <MiradorBroadcast />
          <WitnessTicker />
          <ArticleZeroPartialNotice />
          <Tutorial />
          <RunZeroOneOverlay />
          <ArticleZeroReveal />
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
                onOpenSaveLoad={() => setModal("SAVE_LOAD")}
                onOpenSettings={() => setModal("SETTINGS")}
                onOpenAlignment={onOpenAlignment}
                onOpenLog={() => setModal("LOG")}
                onOpenVent={() => {
                  const inc = worldEngine.hasState()
                    ? { caseId: "vent4-iria-cala", sectors: ["RESIDENTIAL-19F", "ADMIN-CORE"] }
                    : null;
                  if (inc) {
                    eventBus.emit("VENT4_DECISION_REQUIRED", inc);
                    setModal("VENT");
                  }
                }}
              />
            </>
          )}
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
