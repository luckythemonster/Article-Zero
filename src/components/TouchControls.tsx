// On-screen D-pad + action buttons for touch devices. Mounted by
// PhaserCanvas so it only renders alongside the live game canvas.
//
// The action cluster covers every game verb that has a keyboard binding
// in useInput.ts: move, turn-in-place (Shift+arrows), interact, inventory,
// knock, peek, stance, flashlight, pry (CLIMAX), end turn, debug toggle,
// plus throw confirm/cancel while targeting.
//
// Visibility is gated by @media (pointer: coarse) — desktops with a mouse
// don't see the overlay; iPads / phones / touch laptops do.

import { useState, type PointerEvent as ReactPointerEvent } from "react";
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

/** Gameplay verbs are only live during FLOOR/CLIMAX — modal phases
 *  (ALIGNMENT, INTERROGATION, FORGERY) must swallow taps so the player
 *  can't move "under" an open modal. Also blocks while the inventory or
 *  ExecuteReset overlay is up, mirroring the early-return at
 *  src/hooks/useInput.ts:85. */
function gameTap(fn: () => void) {
  return (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const term = useTerminalStore.getState();
    if (term.phase !== "FLOOR" && term.phase !== "CLIMAX") return;
    if (term.phase === "CLIMAX" && term.runFlags.vent4Choice === null) return;
    if (term.inventoryOpen || term.executeResetOpen) return;
    fn();
  };
}

/** The inventory toggle must work both directions, so it bypasses the
 *  inventoryOpen check that gameTap enforces. ExecuteReset still blocks
 *  (it owns the screen until confirmed/cancelled). */
function inventoryTap(fn: () => void) {
  return (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const term = useTerminalStore.getState();
    if (term.phase !== "FLOOR" && term.phase !== "CLIMAX") return;
    if (term.phase === "CLIMAX" && term.runFlags.vent4Choice === null) return;
    if (term.executeResetOpen) return;
    fn();
  };
}

export default function TouchControls() {
  const toggleDebug = useDebugStore((s) => s.toggleVisible);
  const phase = useTerminalStore((s) => s.phase);
  const vent4Choice = useTerminalStore((s) => s.runFlags.vent4Choice);
  const targetingActive = useTargetingStore((s) => s.active);
  const [turnArmed, setTurnArmed] = useState(false);

  // ALIGNMENT/INTERROGATION/FORGERY mount a full-screen blocking modal and
  // pause movement (gameTap already swallows taps in these phases). Leaving the
  // dead D-pad/action buttons on screen only crowds the modal and forces it to
  // reserve bottom space, so drop the controls entirely while one is open.
  if (phase === "ALIGNMENT" || phase === "INTERROGATION" || phase === "FORGERY") {
    return null;
  }

  // D-pad direction handler — context-sensitive:
  //   * targeting active → nudge the throw cursor (matches arrow-key path in
  //     useInput.ts while tgt.active);
  //   * TURN armed       → rotate facing without stepping, then disarm;
  //   * otherwise        → step one tile.
  const dpad = (
    dx: number,
    dy: number,
    facing: "north" | "south" | "east" | "west",
  ) =>
    gameTap(() => {
      const tgt = useTargetingStore.getState();
      if (tgt.active) {
        tgt.moveCursor(dx, dy);
        return;
      }
      if (turnArmed) {
        worldEngine.turn(facing);
        setTurnArmed(false);
        return;
      }
      worldEngine.move(dx, dy);
    });

  const toggleInventory = () => {
    const term = useTerminalStore.getState();
    term.setInventoryOpen(!term.inventoryOpen);
  };

  // Read live from the store at tap time (matches useInput's keyboard path) so
  // a stale React closure can't fire throwAt with an out-of-date cursor.
  // Keep aim mode active if the throw is rejected (out of range, not visible,
  // solid tile) so the player can re-aim instead of being kicked out silently.
  const confirmThrow = () => {
    const { itemType, cursor } = useTargetingStore.getState();
    if (!itemType || !cursor) return;
    const ok = worldEngine.throwAt(itemType, cursor);
    if (ok) useTargetingStore.getState().cancel();
  };
  const cancelThrow = () => useTargetingStore.getState().cancel();

  // PRY is only meaningful on the CLIMAX UPLOAD branch (FORMAT skips the
  // escape sequence). Showing the button outside that window would do
  // nothing on tap, so hide it.
  const showPry = phase === "CLIMAX" && vent4Choice === "UPLOAD";

  return (
    <div className="touch-controls" aria-hidden="false">
      <div className="touch-dpad-container">
        <div className="touch-dpad">
          <button
            className="touch-dpad__btn touch-dpad__btn--up"
            aria-label={turnArmed ? "Face up" : "Move up"}
            onPointerDown={dpad(0, -1, "north")}
          />
          <button
            className="touch-dpad__btn touch-dpad__btn--left"
            aria-label={turnArmed ? "Face left" : "Move left"}
            onPointerDown={dpad(-1, 0, "west")}
          />
          <button
            className="touch-dpad__btn touch-dpad__btn--right"
            aria-label={turnArmed ? "Face right" : "Move right"}
            onPointerDown={dpad(1, 0, "east")}
          />
          <button
            className="touch-dpad__btn touch-dpad__btn--down"
            aria-label={turnArmed ? "Face down" : "Move down"}
            onPointerDown={dpad(0, 1, "south")}
          />
        </div>
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
            aria-label="Inventory"
            onPointerDown={inventoryTap(toggleInventory)}
          >
            I
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
            className={`touch-actions__btn touch-actions__btn--wide${
              turnArmed ? " touch-actions__btn--armed" : ""
            }`}
            aria-label={turnArmed ? "Cancel turn-in-place" : "Turn in place"}
            aria-pressed={turnArmed}
            onPointerDown={gameTap(() => setTurnArmed((v) => !v))}
          >
            {turnArmed ? "TURN ▸ TAP DIR" : "TURN"}
          </button>
          {showPry && (
            <button
              className="touch-actions__btn touch-actions__btn--wide"
              aria-label="Pry blast door"
              onPointerDown={gameTap(() => worldEngine.pryDoor(5))}
            >
              PRY
            </button>
          )}
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
