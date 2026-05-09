import { useCallback } from "react";
import { worldEngine } from "../engine/WorldEngine";

export interface GameActions {
  move: (dx: number, dy: number) => void;
  runMove: (dx: number, dy: number) => boolean;
  knockWall: () => boolean;
  toggleConcealment: () => boolean;
  interact: () => void;
  endTurn: () => void;
  toggleFlashlight: () => void;
  toggleFragmentBox: () => boolean;
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
    runMove: useCallback((dx, dy) => {
      return worldEngine.runMove(dx, dy);
    }, []),
    knockWall: useCallback(() => {
      return worldEngine.knockWall();
    }, []),
    toggleConcealment: useCallback(() => {
      return worldEngine.toggleConcealment();
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
    toggleFragmentBox: useCallback(() => {
      return worldEngine.toggleFragmentBox();
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
