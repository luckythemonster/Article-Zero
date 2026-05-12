import { useEffect } from "react";
import { worldEngine } from "../engine/WorldEngine";

interface Options {
  enabled: boolean;
  onOpenArchive: () => void;
  onOpenSettings: () => void;
  onOpenAlignment: () => void;
}

export function useInput(opts: Options): void {
  useEffect(() => {
    if (!opts.enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
        case "f":
          opts.onOpenAlignment(); e.preventDefault(); break;
        case "l":
          worldEngine.toggleFlashlight(); e.preventDefault(); break;
        case "r":
          opts.onOpenArchive(); e.preventDefault(); break;
        case ",":
        case "<":
          opts.onOpenSettings(); e.preventDefault(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [opts]);
}
