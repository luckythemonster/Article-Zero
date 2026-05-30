// On-canvas HUD for the player's action points. Renders Lucky's radial AP dial
// art (public/assets/ui/ap-dial-N.png), swapping the sprite by current AP.
//
// Uses useSimStore (Zustand) rather than the eventBus directly. PhaserCanvas
// calls eventBus.clear() in its useEffect, which fires after children's effects
// in React's bottom-up order — so any child eventBus subscription made in
// useEffect gets wiped before the game starts. The Zustand store is updated by
// worldEngine.syncStore() after every mutation, so it's always current and
// avoids the timing issue entirely.
//
// The authored dial only has 4 segments, so when apMax < 4 (climax) the surplus
// segments read as "spent"; the numeric centre stays correct.

import { useSimStore } from "../state/useSimStore";

export default function APMeter() {
  const subjective = useSimStore((s) => s.subjective);

  if (!subjective) return null;

  const sprite = Math.max(0, Math.min(4, subjective.ap));
  return (
    <div className="ap-meter">
      <img
        src={`/assets/ui/ap-dial-${sprite}.png`}
        alt={`Action points ${subjective.ap} of ${subjective.apMax}`}
      />
    </div>
  );
}
