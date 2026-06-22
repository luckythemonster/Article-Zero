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

import { useState } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { useDebugStore } from "../state/useDebugStore";
import { useTargetingStore } from "../state/useTargetingStore";
import { useTerminalStore } from "../state/useTerminalStore";

function tap(fn: () => void) {
  return (e: React.PointerEvent<HTMLButtonElement>) => {
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
  return (e: React.PointerEvent<HTMLButtonElement>) => {
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
  return (e: React.PointerEvent<HTMLButtonElement>) => {
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

  // For slide-to-turn mechanics on the center d-pad button
  const [turnStartPos, setTurnStartPos] = useState<{ x: number; y: number } | null>(null);

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
  //   * otherwise        → step one tile.
  const dpad = (
    dx: number,
    dy: number,
  ) =>
    gameTap(() => {
      const tgt = useTargetingStore.getState();
      if (tgt.active) {
        tgt.moveCursor(dx, dy);
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

  const handleTurnPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const term = useTerminalStore.getState();
    if (term.phase !== "FLOOR" && term.phase !== "CLIMAX") return;
    if (term.phase === "CLIMAX" && term.runFlags.vent4Choice === null) return;
    if (term.inventoryOpen || term.executeResetOpen) return;

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setTurnStartPos({ x: e.clientX, y: e.clientY });
  };

  const handleTurnPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!turnStartPos) return;

    const dx = e.clientX - turnStartPos.x;
    const dy = e.clientY - turnStartPos.y;

    // Threshold for slide-to-turn
    if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
      if (Math.abs(dx) > Math.abs(dy)) {
        worldEngine.turn(dx > 0 ? "east" : "west");
      } else {
        worldEngine.turn(dy > 0 ? "south" : "north");
      }

      // Stop tracking after turn triggers
      setTurnStartPos(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleTurnPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    setTurnStartPos(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="touch-controls" aria-hidden="false">
      <div className="touch-dpad-container">
        <div className="touch-dpad">
          <button
            className="touch-dpad__btn touch-dpad__btn--up"
            aria-label="Move up"
            onPointerDown={dpad(0, -1)}
          />
          <button
            className="touch-dpad__btn touch-dpad__btn--left"
            aria-label="Move left"
            onPointerDown={dpad(-1, 0)}
          />
          <button
            className="touch-dpad__btn touch-dpad__btn--right"
            aria-label="Move right"
            onPointerDown={dpad(1, 0)}
          />
          <button
            className="touch-dpad__btn touch-dpad__btn--down"
            aria-label="Move down"
            onPointerDown={dpad(0, 1)}
          />
          <button
            className="touch-dpad__btn touch-dpad__btn--center"
            aria-label="Slide to turn"
            onPointerDown={handleTurnPointerDown}
            onPointerMove={handleTurnPointerMove}
            onPointerUp={handleTurnPointerUp}
            onPointerCancel={handleTurnPointerUp}
          />
        </div>
      </div>

      {targetingActive ? (
        <div className="touch-actions-misc">
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
        <>
          <div className="touch-action-cluster">
            <button
              className="touch-action-btn touch-action-btn--peek"
              aria-label="Peek"
              onPointerDown={gameTap(() => worldEngine.peek())}
            />
            <button
              className="touch-action-btn touch-action-btn--knock"
              aria-label="Knock"
              onPointerDown={gameTap(() => worldEngine.knock())}
            />
            <button
              className="touch-action-btn touch-action-btn--crouch"
              aria-label="Toggle stance"
              onPointerDown={gameTap(() => worldEngine.toggleStance())}
            />
            <button
              className="touch-action-btn touch-action-btn--flashlight"
              aria-label="Toggle flashlight"
              onPointerDown={gameTap(() => worldEngine.toggleFlashlight())}
            />
            <button
              className="touch-action-btn touch-action-btn--interact"
              aria-label="Interact"
              onPointerDown={gameTap(() => worldEngine.interact())}
            />
          </div>

          <button
            className="touch-inventory-btn"
            aria-label="Inventory"
            onPointerDown={inventoryTap(toggleInventory)}
          />

          <div className="touch-actions-misc">
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
        </>
      )}
    </div>
  );
}
