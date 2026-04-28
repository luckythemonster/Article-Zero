// TouchControls — on-screen d-pad + interact / end turn for mobile.

import { worldEngine } from "../engine/WorldEngine";

export default function TouchControls() {
  return (
    <div className="az-touch" aria-hidden="false">
      <button className="empty" />
      <button onClick={() => worldEngine.move(0, -1)}>↑</button>
      <button className="empty" />
      <button onClick={() => worldEngine.move(-1, 0)}>←</button>
      <button onClick={() => worldEngine.endTurn()}>·</button>
      <button onClick={() => worldEngine.move(1, 0)}>→</button>
      <button onClick={() => worldEngine.interact()}>E</button>
      <button onClick={() => worldEngine.move(0, 1)}>↓</button>
      <button onClick={() => worldEngine.toggleFlashlight()}>L</button>
    </div>
  );
}
