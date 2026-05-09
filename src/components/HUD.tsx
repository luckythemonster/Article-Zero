import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { articleZeroMeta } from "../engine/ArticleZeroMeta";
import SolitonRadar from "./SolitonRadar";
import type {
  AlertLevel,
  ComplianceStatus,
  SubjectivityBelief,
} from "../types/world.types";

const ALERT_GLYPH: Record<AlertLevel, string> = {
  NORMAL: "",
  CAUTION: "?",
  EVASION: "…",
  ALERT: "!",
};

const ALERT_CLASS: Record<AlertLevel, string> = {
  NORMAL: "",
  CAUTION: "yellow",
  EVASION: "yellow",
  ALERT: "red",
};

export default function HUD() {
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  useEffect(() => {
    const offs = [
      eventBus.on("PLAYER_AP_CHANGED", refresh),
      eventBus.on("PLAYER_MOVED", refresh),
      eventBus.on("TURN_START", refresh),
      eventBus.on("TURN_END", refresh),
      eventBus.on("FLASHLIGHT_TOGGLED", refresh),
      eventBus.on("FOV_UPDATED", refresh),
      eventBus.on("PLAYER_DETECTED", refresh),
      eventBus.on("PLAYER_DETAINED", refresh),
      eventBus.on("PLAYER_DETECTION_CLEARED", refresh),
      eventBus.on("SUBJECTIVITY_BELIEF_SHIFTED", refresh),
      eventBus.on("PLAYER_COMPLIANCE_CHANGED", refresh),
      eventBus.on("RESONANCE_SHIFT", refresh),
      eventBus.on("AMBIENT_LIGHT_CHANGED", refresh),
      eventBus.on("ARTICLE_ZERO_RESOLVED", refresh),
      eventBus.on("ALERT_LEVEL_CHANGED", refresh),
      eventBus.on("PLAYER_CONCEALED", refresh),
      eventBus.on("PLAYER_REVEALED", refresh),
    ];
    return () => { for (const off of offs) off(); };
  }, []);

  if (!worldEngine.hasState()) return null;
  const s = worldEngine.getState();

  const complianceClass: Record<ComplianceStatus, string> = {
    GREEN: "green", YELLOW: "", RED: "red",
  };
  const beliefLabel: Record<SubjectivityBelief, string> = {
    NONE: "BELIEF: NONE",
    CONTESTED: "BELIEF: CONTESTED",
    SHAKEN: "BELIEF: SHAKEN",
    AFFIRMED: "BELIEF: AFFIRMED",
  };

  return (
    <div className="az-hud-top">
      {(() => {
        const holdingBox = s.player.inventory.some((i) => i.itemType === "FRAGMENT_BOX");
        const effectiveMax = Math.max(0, s.player.apMax - (holdingBox ? 1 : 0));
        return (
          <>
            <span>{s.player.name}</span>
            <span>TURN {s.turn}</span>
            <span>AP {s.player.ap}/{effectiveMax}</span>
            <span>COND {s.player.condition}/{s.player.conditionMax}</span>
            <span className={complianceClass[s.player.compliance]}>COMP: {s.player.compliance}</span>
            <span>{beliefLabel[s.player.belief]}</span>
            <span>HUM {s.substrateResonance}%</span>
            {s.player.flashlightOn && <span className="green">FLASHLIGHT {s.player.flashlightBattery}</span>}
            {holdingBox && <span className="red">ENCUMBERED // FRAGMENT BOX</span>}
            {s.alignmentLightActive && <span className="red">LIGHT SPILL</span>}
            {s.alertLevel !== "NORMAL" && !s.detained && (
              <span className={ALERT_CLASS[s.alertLevel]}>
                ALERT {ALERT_GLYPH[s.alertLevel]} {s.alertLevel}
              </span>
            )}
            {s.concealedEntityId && <span className="green">HIDDEN</span>}
            {s.detained && <span className="red">DETAINED</span>}
            {s.redDay && <span className="red">RED_DAY</span>}
          </>
        );
      })()}
      {(() => {
        const r = articleZeroMeta.getResolution();
        if (s.player.runaway) return <span className="red">STATUS: RUNAWAY</span>;
        if (r === "ACCEPTED") return <span className="green">STATUS: COMPLIANT</span>;
        return null;
      })()}
      <SolitonRadar />
    </div>
  );
}
