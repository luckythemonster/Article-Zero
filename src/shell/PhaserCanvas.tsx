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
    // alongside the debug tap and audio bridges. Each installer returns its own
    // teardown fn; a single scope owns them all so cleanup is one dispose() call.
    const bridges = eventBus.createScope();
    bridges.add(installEventBridge());
    bridges.add(installDebugEventTap());
    bridges.add(installFootstepBridge());
    bridges.add(installMusicBridge(moduleId));
    bridges.add(installSfxBridge());

    // ── Teardown order (ownership lives here, not spread across subsystems) ──
    // The sequence below is deliberate; reordering risks handler leaks or
    // use-after-destroy:
    //   1. bridges.dispose()  — detach React/audio/debug bus listeners FIRST,
    //      so nothing reacts to events emitted while the game tears down.
    //   2. game.destroy(true) — destroying the game runs RoomScene.shutdown(),
    //      which disposes the scene's own EventBus scope and frees its sprites.
    //      (Listeners are gone before any destroy event fires.)
    //   3. eventBus.clear()   — defensive global wipe; scopes already removed
    //      everything, this just guarantees a clean bus for the next mount.
    //   4. setActiveModule(null) — reset the Zustand store LAST, after all
    //      Phaser cleanup, so no late handler reads a half-reset store.
    return () => {
      bridges.dispose();
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
