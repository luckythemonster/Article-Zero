// Keyboard input for the active Phaser module.
// Handles only movement / interaction / game verbs; command text is handled
// by CommandLine.tsx.

import { useEffect } from "react";
import { worldEngine } from "../engine/WorldEngine";

interface Options {
  enabled: boolean;
}

export function useInput({ enabled }: Options): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't steal keys while the user is typing in an input/textarea.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!worldEngine.hasState()) return;
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
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}
