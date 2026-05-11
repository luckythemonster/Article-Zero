import { useCallback } from "react";
import { worldEngine } from "../engine/WorldEngine";
import type { Facing } from "../types/world.types";

export interface GameActions {
  move: (dx: number, dy: number) => void;
  interact: () => void;
  endTurn: () => void;
  toggleFlashlight: () => void;
  toggleStance: () => void;
  knock: () => boolean;
  peek: (dir?: Facing) => boolean;
  canStartAlignment: (entityId: string) => { ok: boolean; reason?: string };
  commitAlignment: (entityId: string) => boolean;
  spendAlignmentAdvance: () => boolean;
  killScreen: () => boolean;
  wakeScreen: () => boolean;
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
    toggleStance: useCallback(() => {
      worldEngine.toggleStance();
    }, []),
    knock: useCallback(() => {
      return worldEngine.knock();
    }, []),
    peek: useCallback((dir?: Facing) => {
      return worldEngine.peek(dir);
    }, []),
    canStartAlignment: useCallback((entityId: string) => {
      return worldEngine.canStartAlignment(entityId);
    }, []),
    commitAlignment: useCallback((entityId: string) => {
      return worldEngine.commitAlignment(entityId);
    }, []),
    spendAlignmentAdvance: useCallback(() => {
      return worldEngine.spendAlignmentAdvance();
    }, []),
    killScreen: useCallback(() => {
      return worldEngine.killScreen();
    }, []),
    wakeScreen: useCallback(() => {
      return worldEngine.wakeScreen();
    }, []),
  };
}
