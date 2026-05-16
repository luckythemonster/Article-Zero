// LatticeFocusOverlay — tactical bullet-time tint and HUD callout.
//
// Subscribes to LATTICE_FOCUS_ACTIVE on the EventBus (emitted by RoomScene
// when the Shift key is held / released). While active, RoomScene has also
// dropped scene.physics.world.timeScale to LATTICE_FOCUS_TIMESCALE — this
// component paints the React-side overlay (chromatic tint + corner readout)
// so the player has unambiguous feedback that the lattice is engaged.

import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";

export default function LatticeFocusOverlay() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const off = eventBus.on("LATTICE_FOCUS_ACTIVE", (p) => {
      setActive(p.active);
    });
    return off;
  }, []);

  if (!active) return null;

  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          // Slight cyan tint + faint vignette to read as "tactical".
          background:
            "radial-gradient(ellipse at center, rgba(106,208,164,0.04) 0%, rgba(20,40,55,0.18) 100%)",
          boxShadow: "inset 0 0 80px rgba(106,208,164,0.18)",
          zIndex: 17,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          padding: "4px 10px",
          background: "rgba(5,8,9,0.85)",
          border: "1px solid #6ad0a4",
          fontFamily: "Courier New, monospace",
          fontSize: "11px",
          letterSpacing: "1.5px",
          color: "#6ad0a4",
          pointerEvents: "none",
          zIndex: 19,
        }}
      >
        LATTICE // FOCUS
      </div>
    </>
  );
}
