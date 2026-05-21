// Keyboard input for the active Phaser module.
// Handles only movement / interaction / game verbs; command text is handled
// by CommandLine.tsx.

import { useEffect } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { useTerminalStore } from "../state/useTerminalStore";
import { useDebugStore } from "../state/useDebugStore";

interface Options {
  enabled: boolean;
}

export function useInput({ enabled }: Options): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Debug overlay toggle (~). Works regardless of focus + phase so the
      // archivist can always inspect mid-modal.
      if (e.code === "Backquote") {
        useDebugStore.getState().toggleVisible();
        e.preventDefault();
        return;
      }

      // Don't steal keys while the user is typing in an input/textarea.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // Sprite gallery toggle (G). Works regardless of phase so the gallery
      // can be opened from FRAME / EPILOGUE too.
      if (e.code === "KeyG") {
        useDebugStore.getState().toggleGallery();
        e.preventDefault();
        return;
      }

      if (!worldEngine.hasState()) return;
      // Only let keyboard verbs through during FLOOR and CLIMAX. Modal-only
      // phases (ALIGNMENT, FORGERY) would otherwise let WASD move Rowan
      // behind the modal. EPILOGUE/FRAME are pure UI. CLIMAX has a brief
      // dilemma-modal window before the player picks; block then too.
      const term = useTerminalStore.getState();
      if (term.phase !== "FLOOR" && term.phase !== "CLIMAX") return;
      if (term.phase === "CLIMAX" && term.runFlags.vent4Choice === null) return;

      // U toggles the inventory overlay. Works whether it's already open or
      // not; Esc while open is handled inside the overlay component itself.
      if (e.key.toLowerCase() === "u") {
        term.setInventoryOpen(!term.inventoryOpen);
        e.preventDefault();
        return;
      }

      // While the inventory overlay is open, suppress all other game verbs so
      // the player doesn't move while browsing.
      if (term.inventoryOpen) return;

      switch (e.key.toLowerCase()) {
        case "arrowup":
        case "w":
          worldEngine.move(0, -1); e.preventDefault(); break;
        case "arrowdown":
        case "s":
          worldEngine.move(0, 1); e.preventDefault(); break;
        case "arrowleft":
        case "a":
          worldEngine.move(-1, 0); e.preventDefault(); break;
        case "arrowright":
        case "d":
          worldEngine.move(1, 0); e.preventDefault(); break;
        case " ":
          worldEngine.endTurn(); e.preventDefault(); break;
        case "e":
          worldEngine.interact(); e.preventDefault(); break;
        case "k":
          worldEngine.knock(); e.preventDefault(); break;
        case "q":
          worldEngine.peek(); e.preventDefault(); break;
        case "c":
          worldEngine.toggleStance(); e.preventDefault(); break;
        case "l":
          worldEngine.toggleFlashlight(); e.preventDefault(); break;
        case "p":
          // Climax escape: pry the blast door the player is facing. 5 presses.
          if (term.phase === "CLIMAX") {
            worldEngine.pryDoor(5);
            e.preventDefault();
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}
