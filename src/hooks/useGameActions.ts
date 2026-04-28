import { useCallback } from "react";
import { worldEngine } from "../engine/WorldEngine";

export interface GameActions {
  move: (dx: number, dy: number) => void;
  interact: () => void;
  endTurn: () => void;
  toggleFlashlight: () => void;
  attemptAlignment: (entityId: string) => void;
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
    attemptAlignment: useCallback((entityId: string) => {
      worldEngine.attemptAlignment(entityId);
    }, []),
  };
}
