import { useEffect } from "react";
import { worldEngine } from "../engine/WorldEngine";

interface Options {
  enabled: boolean;
  onOpenArchive: () => void;
  onOpenSettings: () => void;
  onOpenSaveLoad: () => void;
  onOpenAlignment: () => void;
}

export function useInput(opts: Options): void {
  useEffect(() => {
    if (!opts.enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!worldEngine.hasState()) return;
      // Shift+Arrow = run (2 tiles, emits noise). Falls back to a single-tile
      // move when shift isn't held — the existing keybinding shape.
      const shifted = e.shiftKey;
      const moveOrRun = (dx: number, dy: number) => {
        if (shifted) worldEngine.runMove(dx, dy);
        else worldEngine.move(dx, dy);
      };
      switch (e.key.toLowerCase()) {
        case "arrowup":
        case "w":
          moveOrRun(0, -1); e.preventDefault(); break;
        case "arrowdown":
        case "s":
          moveOrRun(0, 1); e.preventDefault(); break;
        case "arrowleft":
        case "a":
          moveOrRun(-1, 0); e.preventDefault(); break;
        case "arrowright":
        case "d":
          moveOrRun(1, 0); e.preventDefault(); break;
        case " ":
          worldEngine.endTurn(); e.preventDefault(); break;
        case "e":
          worldEngine.interact(); e.preventDefault(); break;
        case "f":
          opts.onOpenAlignment(); e.preventDefault(); break;
        case "l":
          worldEngine.toggleFlashlight(); e.preventDefault(); break;
        case "b":
          worldEngine.toggleFragmentBox(); e.preventDefault(); break;
        case "k":
          worldEngine.knockWall(); e.preventDefault(); break;
        case "h":
          worldEngine.toggleConcealment(); e.preventDefault(); break;
        case "r":
          opts.onOpenArchive(); e.preventDefault(); break;
        case "m":
          opts.onOpenSaveLoad(); e.preventDefault(); break;
        case ",":
        case "<":
          opts.onOpenSettings(); e.preventDefault(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [opts]);
}
