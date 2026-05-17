// Phase 4 (UPLOAD path) — owns the 60s suffocation countdown, emits
// OXYGEN_TICK so RoomScene can darken the camera, watches PLAYER_MOVED for
// the player landing on the locker EXFIL_POINT (success), and ramps down
// player.apMax every 15s so the escape gets visibly tighter.
//
// On t=0 with no escape, emits PHASE_RESTART_REQUESTED. Listening to
// CLIMAX_ESCAPED is the eventBridge's job (it flips us to EPILOGUE).

import { useEffect, useRef, useState } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { eventBus } from "../engine/EventBus";
import { useTerminalStore } from "../state/useTerminalStore";

const TOTAL_SECONDS = 60;
/** AP cap shed every N seconds. By 45s elapsed the player is at 1 AP/turn. */
const AP_DECREMENT_INTERVAL = 15;

export default function ClimaxOverlay() {
  const choice = useTerminalStore((s) => s.runFlags.vent4Choice);
  const [seconds, setSeconds] = useState(TOTAL_SECONDS);
  const tickRef = useRef<number | null>(null);
  const movedSubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (choice !== "UPLOAD") return;

    // Reset oxygen darken at start.
    eventBus.emit("OXYGEN_TICK", {
      remainingSeconds: TOTAL_SECONDS,
      totalSeconds: TOTAL_SECONDS,
    });

    tickRef.current = window.setInterval(() => {
      setSeconds((s) => {
        const next = Math.max(0, s - 1);
        eventBus.emit("OXYGEN_TICK", {
          remainingSeconds: next,
          totalSeconds: TOTAL_SECONDS,
        });
        // Step down apMax at 15s/30s/45s elapsed.
        const elapsed = TOTAL_SECONDS - next;
        if (elapsed > 0 && elapsed % AP_DECREMENT_INTERVAL === 0) {
          try {
            const state = worldEngine.getState();
            if (state.player.apMax > 1) {
              state.player.apMax -= 1;
              if (state.player.ap > state.player.apMax) {
                state.player.ap = state.player.apMax;
              }
              eventBus.emit("PLAYER_AP_CHANGED", {
                previous: state.player.ap + 1,
                current: state.player.ap,
              });
            }
          } catch {
            /* tolerate teardown */
          }
        }
        if (next <= 0) {
          // Time-out: trigger an audit-style restart of the floor.
          eventBus.emit("PHASE_RESTART_REQUESTED", { reason: "oxygen-zero" });
        }
        return next;
      });
    }, 1000);

    // Watch for the player landing on the EXFIL_POINT in the locker — that's
    // the win condition for the escape.
    movedSubRef.current = eventBus.on("PLAYER_MOVED", (p) => {
      if (p.roomId !== "locker") return;
      try {
        const state = worldEngine.getState();
        const t = state.rooms.get("locker")?.tiles[
          state.player.pos.y * (state.rooms.get("locker")?.width ?? 10) +
            state.player.pos.x
        ];
        if (t && t.kind === "EXFIL_POINT") {
          eventBus.emit("CLIMAX_ESCAPED", {});
        }
      } catch {
        /* tolerate */
      }
    });

    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      movedSubRef.current?.();
      movedSubRef.current = null;
    };
  }, [choice]);

  if (choice !== "UPLOAD") return null;

  return (
    <div className="climax-hud">
      OXYGEN: {seconds}s
      <div className="climax-hud__sub">PRY (P) — REACH THE LOCKER EXFIL</div>
    </div>
  );
}
