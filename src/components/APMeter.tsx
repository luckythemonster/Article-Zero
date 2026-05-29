// On-canvas HUD for the player's action points. Renders Lucky's radial AP dial
// art (public/assets/ui/ap-dial-N.png), swapping the sprite by current AP.
//
// State is read straight off the engine on each PLAYER_AP_CHANGED / TURN_START
// rather than from useSimStore: the climax apMax step-down (ClimaxOverlay)
// mutates player.apMax without a store sync, but it does emit PLAYER_AP_CHANGED.
//
// The authored dial only has 4 segments, so when apMax < 4 (climax) the surplus
// segments read as "spent"; the numeric centre stays correct.

import { useEffect, useState } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { eventBus } from "../engine/EventBus";

function readAp(): { ap: number; apMax: number } | null {
  try {
    const p = worldEngine.getState().player;
    return { ap: p.ap, apMax: p.apMax };
  } catch {
    return null;
  }
}

export default function APMeter() {
  const [state, setState] = useState(readAp);

  useEffect(() => {
    const refresh = () => setState(readAp());
    refresh();
    const offChanged = eventBus.on("PLAYER_AP_CHANGED", refresh);
    const offTurn = eventBus.on("TURN_START", refresh);
    return () => {
      offChanged();
      offTurn();
    };
  }, []);

  if (!state) return null;

  const sprite = Math.max(0, Math.min(4, state.ap));
  return (
    <div className="ap-meter">
      <img
        src={`/assets/ui/ap-dial-${sprite}.png`}
        alt={`Action points ${state.ap} of ${state.apMax}`}
      />
    </div>
  );
}
