import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { complianceSystem } from "../engine/ComplianceSystem";

export default function HUD() {
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  useEffect(() => {
    const offs = [
      eventBus.on("PLAYER_AP_CHANGED", refresh),
      eventBus.on("PLAYER_MOVED", refresh),
      eventBus.on("PLAYER_FACING_CHANGED", refresh),
      eventBus.on("PLAYER_STANCE_CHANGED", refresh),
      eventBus.on("TURN_START", refresh),
      eventBus.on("TURN_END", refresh),
      eventBus.on("FLASHLIGHT_TOGGLED", refresh),
      eventBus.on("FOV_UPDATED", refresh),
      eventBus.on("PLAYER_DETECTED", refresh),
      eventBus.on("PLAYER_DETAINED", refresh),
      eventBus.on("PLAYER_DETECTION_CLEARED", refresh),
      eventBus.on("AMBIENT_LIGHT_CHANGED", refresh),
      eventBus.on("ROOM_ENTERED", refresh),
      eventBus.on("ALIGNMENT_LIGHT_TOGGLED", refresh),
      eventBus.on("COMPLIANCE_CHANGED", refresh),
      eventBus.on("Q_SCORE_CHANGED", refresh),
      eventBus.on("ITEM_PICKED_UP", refresh),
      eventBus.on("ITEM_FILED", refresh),
      eventBus.on("EXTRACTION_PROGRESS", refresh),
    ];
    return () => { for (const off of offs) off(); };
  }, []);

  if (!worldEngine.hasState()) return null;
  const s = worldEngine.getState();
  const room = worldEngine.getCurrentRoom();
  const { tier, reasons } = complianceSystem.derive(s);
  const pillLabel =
    tier === "GREEN" ? "COMPLIANT" :
      tier === "YELLOW" ? `WATCHED${reasons.length ? " — " + reasons.join(", ") : ""}` :
        `EXPOSED${reasons.length ? " — " + reasons.join(", ") : ""}`;
  const pillClass =
    tier === "GREEN" ? "green" : tier === "YELLOW" ? "" : "red";

  return (
    <div className="az-hud-top">
      <span>{s.player.name}</span>
      <span>TURN {s.turn}</span>
      <span>AP {s.player.ap}/{s.player.apMax}</span>
      <span>{room?.name ?? "—"}</span>
      <span>STANCE: {s.player.stance}</span>
      <span className={pillClass}>{pillLabel}</span>
      {s.player.qScore > 0 && <span>Q={s.player.qScore}</span>}
      {s.player.flashlightOn && <span className="green">FLASHLIGHT {s.player.flashlightBattery}</span>}
      {s.alignmentLightActive && <span className="red">LIGHT SPILL</span>}
      {s.detected && !s.detained && <span className="red">DETECTED</span>}
      {s.detained && <span className="red">DETAINED</span>}
    </div>
  );
}
