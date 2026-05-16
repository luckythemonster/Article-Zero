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

    return () => {
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
    </div>
  );
}
