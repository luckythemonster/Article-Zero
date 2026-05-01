import { useCallback } from "react";
import { worldEngine } from "../engine/WorldEngine";

export interface GameActions {
  move: (dx: number, dy: number) => void;
  interact: () => void;
  endTurn: () => void;
  toggleFlashlight: () => void;
  canStartAlignment: (entityId: string) => { ok: boolean; reason?: string };
  commitAlignment: (entityId: string) => boolean;
}

export function useGameActions(): GameActions {
  return {
    move: useCallback((dx, dy) => {
      worldEngine.move(dx, dy);
    }, []),
    interact: useCallback(() => {
      worldEngine.interact();
    }, []),
    endTurn: useCallback(() => {
      worldEngine.endTurn();
    }, []),
    toggleFlashlight: useCallback(() => {
      worldEngine.toggleFlashlight();
    }, []),
    canStartAlignment: useCallback((entityId: string) => {
      return worldEngine.canStartAlignment(entityId);
    }, []),
    commitAlignment: useCallback((entityId: string) => {
      return worldEngine.commitAlignment(entityId);
    }, []),
  };
}
