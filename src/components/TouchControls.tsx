// On-screen D-pad + action buttons for touch devices. Mounted by
// PhaserCanvas so it only renders alongside the live game canvas.
//
// Direction buttons fire one worldEngine.move() per tap (same as a
// keyboard arrow press). Action buttons fire the same WorldEngine methods
// useInput.ts maps to keys.
//
// Visibility is gated by @media (pointer: coarse) — desktops with a mouse
// don't see the overlay; iPads / phones / touch laptops do.

import type { PointerEvent as ReactPointerEvent } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { useDebugStore } from "../state/useDebugStore";
import { useTargetingStore } from "../state/useTargetingStore";
import { useTerminalStore } from "../state/useTerminalStore";

function tap(fn: () => void) {
  return (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    fn();
  };
}

/** Gameplay verbs are only live during FLOOR/CLIMAX — modal phases (ALIGNMENT,
 *  INTERROGATION, FORGERY) must swallow taps so the player can't move "under"
 *  an open modal. Mirrors the phase gate in useInput.ts for the keyboard. */
function gameTap(fn: () => void) {
  return (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const term = useTerminalStore.getState();
    if (term.phase !== "FLOOR" && term.phase !== "CLIMAX") return;
    if (term.phase === "CLIMAX" && term.runFlags.vent4Choice === null) return;
    fn();
  };
}

export default function TouchControls() {
  const toggleDebug = useDebugStore((s) => s.toggleVisible);
  const phase = useTerminalStore((s) => s.phase);
  const targetingActive = useTargetingStore((s) => s.active);
  const targetingItem = useTargetingStore((s) => s.itemType);
  const targetingCursor = useTargetingStore((s) => s.cursor);

  // ALIGNMENT/INTERROGATION/FORGERY mount a full-screen blocking modal and
  // pause movement (gameTap already swallows taps in these phases). Leaving the
  // dead D-pad/action buttons on screen only crowds the modal and forces it to
  // reserve bottom space, so drop the controls entirely while one is open.
  if (phase === "ALIGNMENT" || phase === "INTERROGATION" || phase === "FORGERY") {
    return null;
  }

  const confirmThrow = () => {
    if (targetingItem && targetingCursor) {
      worldEngine.throwAt(targetingItem, targetingCursor);
    }
    useTargetingStore.getState().cancel();
  };
  const cancelThrow = () => useTargetingStore.getState().cancel();

  return (
    <div className="touch-controls" aria-hidden="false">
      <div className="touch-dpad">
        <button
          className="touch-dpad__btn touch-dpad__btn--up"
          aria-label="Move up"
          onPointerDown={gameTap(() => worldEngine.move(0, -1))}
        >
          ▲
        </button>
        <button
          className="touch-dpad__btn touch-dpad__btn--left"
          aria-label="Move left"
          onPointerDown={gameTap(() => worldEngine.move(-1, 0))}
        >
          ◀
        </button>
        <button
          className="touch-dpad__btn touch-dpad__btn--right"
          aria-label="Move right"
          onPointerDown={gameTap(() => worldEngine.move(1, 0))}
        >
          ▶
        </button>
        <button
          className="touch-dpad__btn touch-dpad__btn--down"
          aria-label="Move down"
          onPointerDown={gameTap(() => worldEngine.move(0, 1))}
        >
          ▼
        </button>
      </div>

      {targetingActive ? (
        <div className="touch-actions">
          <button
            className="touch-actions__btn touch-actions__btn--wide"
            aria-label="Throw"
            onPointerDown={tap(confirmThrow)}
          >
            THROW
          </button>
          <button
            className="touch-actions__btn touch-actions__btn--wide"
            aria-label="Cancel throw"
            onPointerDown={tap(cancelThrow)}
          >
            CANCEL
          </button>
        </div>
      ) : (
      <div className="touch-actions">
        <button
          className="touch-actions__btn"
          aria-label="Interact"
          onPointerDown={gameTap(() => worldEngine.interact())}
        >
          E
        </button>
        <button
          className="touch-actions__btn"
          aria-label="Knock"
          onPointerDown={gameTap(() => worldEngine.knock())}
        >
          K
        </button>
        <button
          className="touch-actions__btn"
          aria-label="Peek"
          onPointerDown={gameTap(() => worldEngine.peek())}
        >
          Q
        </button>
        <button
          className="touch-actions__btn"
          aria-label="Toggle stance"
          onPointerDown={gameTap(() => worldEngine.toggleStance())}
        >
          C
        </button>
        <button
          className="touch-actions__btn"
          aria-label="Toggle flashlight"
          onPointerDown={gameTap(() => worldEngine.toggleFlashlight())}
        >
          L
        </button>
        <button
          className="touch-actions__btn touch-actions__btn--wide"
          aria-label="End turn"
          onPointerDown={gameTap(() => worldEngine.endTurn())}
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
      )}
    </div>
  );
}
