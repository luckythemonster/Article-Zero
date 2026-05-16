// On-screen D-pad + action buttons for touch devices. Mounted by
// PhaserCanvas so it only renders alongside the live game canvas.
//
// Direction buttons drive the touchInput singleton continuously (the
// physics bridge OR's these flags with keyboard cursors). Action buttons
// fire the same WorldEngine methods useInput.ts maps to keys.
//
// Visibility is gated by @media (pointer: coarse) — desktops with a mouse
// don't see the overlay; iPads / phones / touch laptops do.

import type { PointerEvent as ReactPointerEvent } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { touchInput, type TouchDir } from "../engine/touchInput";
import { useDebugStore } from "../state/useDebugStore";

function holdHandlers(dir: TouchDir) {
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      (e.target as HTMLButtonElement).setPointerCapture?.(e.pointerId);
      touchInput[dir] = true;
    },
    onPointerUp: () => {
      touchInput[dir] = false;
    },
    onPointerCancel: () => {
      touchInput[dir] = false;
    },
    onPointerLeave: () => {
      touchInput[dir] = false;
    },
  };
}

function tap(fn: () => void) {
  return (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    fn();
  };
}

export default function TouchControls() {
  const toggleDebug = useDebugStore((s) => s.toggleVisible);

  return (
    <div className="touch-controls" aria-hidden="false">
      <div className="touch-dpad">
        <button
          className="touch-dpad__btn touch-dpad__btn--up"
          aria-label="Move up"
          {...holdHandlers("up")}
        >
          ▲
        </button>
        <button
          className="touch-dpad__btn touch-dpad__btn--left"
          aria-label="Move left"
          {...holdHandlers("left")}
        >
          ◀
        </button>
        <button
          className="touch-dpad__btn touch-dpad__btn--right"
          aria-label="Move right"
          {...holdHandlers("right")}
        >
          ▶
        </button>
        <button
          className="touch-dpad__btn touch-dpad__btn--down"
          aria-label="Move down"
          {...holdHandlers("down")}
        >
          ▼
        </button>
      </div>

      <div className="touch-actions">
        <button
          className="touch-actions__btn"
          aria-label="Interact"
          onPointerDown={tap(() => worldEngine.interact())}
        >
          E
        </button>
        <button
          className="touch-actions__btn"
          aria-label="Knock"
          onPointerDown={tap(() => worldEngine.knock())}
        >
          K
        </button>
        <button
          className="touch-actions__btn"
          aria-label="Peek"
          onPointerDown={tap(() => worldEngine.peek())}
        >
          Q
        </button>
        <button
          className="touch-actions__btn"
          aria-label="Toggle stance"
          onPointerDown={tap(() => worldEngine.toggleStance())}
        >
          C
        </button>
        <button
          className="touch-actions__btn"
          aria-label="Toggle flashlight"
          onPointerDown={tap(() => worldEngine.toggleFlashlight())}
        >
          L
        </button>
        <button
          className="touch-actions__btn touch-actions__btn--wide"
          aria-label="End turn"
          onPointerDown={tap(() => worldEngine.endTurn())}
        >
          END TURN
        </button>
        <button
          className="touch-actions__btn"
          aria-label="Toggle debug overlay"
          onPointerDown={tap(toggleDebug)}
        >
          ~
        </button>
      </div>
    </div>
  );
}
