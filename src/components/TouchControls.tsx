// TouchControls — on-screen d-pad (right) + action column (left) + a MENU
// button that opens the MobileHudDrawer with everything that lives in the
// right-rail SidePanel on desktop.

import { worldEngine } from "../engine/WorldEngine";

interface Props {
  onOpenMenu: () => void;
  onOpenAlignment: () => void;
  onOpenArchive: () => void;
}

export default function TouchControls({ onOpenMenu, onOpenAlignment, onOpenArchive }: Props) {
  return (
    <>
      <div className="az-touch" aria-label="Movement controls">
        <button className="empty" />
        <button onPointerDown={(e) => { e.preventDefault(); worldEngine.move(0, -1); }} aria-label="Move north">↑</button>
        <button className="empty" />
        <button onPointerDown={(e) => { e.preventDefault(); worldEngine.move(-1, 0); }} aria-label="Move west">←</button>
        <button onPointerDown={(e) => { e.preventDefault(); worldEngine.endTurn(); }} aria-label="End turn">·</button>
        <button onPointerDown={(e) => { e.preventDefault(); worldEngine.move(1, 0); }} aria-label="Move east">→</button>
        <button className="empty" />
        <button onPointerDown={(e) => { e.preventDefault(); worldEngine.move(0, 1); }} aria-label="Move south">↓</button>
        <button className="empty" />
      </div>

      <div className="az-actionbar" aria-label="Action controls">
        <button onPointerDown={(e) => { e.preventDefault(); worldEngine.interact(); }} aria-label="Interact (E)">E</button>
        <button onPointerDown={(e) => { e.preventDefault(); onOpenAlignment(); }} aria-label="Alignment session (F)">F</button>
        <button onPointerDown={(e) => { e.preventDefault(); onOpenArchive(); }} aria-label="Document archive (R)">R</button>
        <button onPointerDown={(e) => { e.preventDefault(); worldEngine.toggleFlashlight(); }} aria-label="Toggle flashlight (L)">L</button>
        <button onPointerDown={(e) => { e.preventDefault(); onOpenMenu(); }} aria-label="Open menu">≡</button>
      </div>
    </>
  );
}
