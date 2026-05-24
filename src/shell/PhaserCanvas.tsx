// PhaserCanvas — owns the Phaser.Game lifecycle for one module.
// Destroys and recreates the game whenever moduleId changes so atlas
// registrations and EventBus handles never bleed across modules.

import { useEffect, useRef, type ReactNode } from "react";
import type * as PhaserTypes from "phaser";
import { createGame } from "../engine/EngineAdapter";
import { eventBus } from "../engine/EventBus";
import { BootScene } from "../phaser/BootScene";
import { RoomScene } from "../phaser/RoomScene";
import { useSimStore } from "../state/useSimStore";
import { useInput } from "../hooks/useInput";
import { installDebugEventTap } from "../engine/DebugEventTap";
import { installEventBridge } from "./eventBridge";
import { installFootstepBridge } from "../audio/footstep-bridge";
import { installMusicBridge } from "../audio/MusicBridge";
import { installSfxBridge } from "../audio/sfx-bridge";
import TouchControls from "../components/TouchControls";
import type { Module } from "../types/world.types";

interface Props {
  moduleId: Module;
  children?: ReactNode;
}

export function PhaserCanvas({ moduleId, children }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<PhaserTypes.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    // Defensive clear — RoomScene.shutdown() handles most handles, but clearing
    // the bus here removes any stale React-side listeners from a prior mount.
    eventBus.clear();

    const game = createGame({
      parent: hostRef.current,
      width: 960,
      height: 640,
      backgroundColor: "#050809",
      scenes: [BootScene, RoomScene],
    });
    game.registry.set("moduleId", moduleId);
    gameRef.current = game;

    // Install bridges AFTER eventBus.clear so their handlers survive the
    // canvas lifecycle. Detach on unmount before the next clear. A
    // TerminalShell-level subscription would be wiped by the clear on every
    // PhaserCanvas mount — so the audit-log/phase eventBridge lives here too,
    // alongside the debug tap and audio bridges.
    const offEventBridge = installEventBridge();
    const offTap = installDebugEventTap();
    const offFootsteps = installFootstepBridge();
    const offMusic = installMusicBridge();
    const offSfx = installSfxBridge();

    return () => {
      offSfx();
      offMusic();
      offFootsteps();
      offTap();
      offEventBridge();
      gameRef.current?.destroy(true);
      gameRef.current = null;
      eventBus.clear();
      useSimStore.getState().setActiveModule(null);
    };
  }, [moduleId]);

  useInput({ enabled: true });

  return (
    <div ref={hostRef} className="phaser-host">
      {children}
      <TouchControls />
    </div>
  );
}
