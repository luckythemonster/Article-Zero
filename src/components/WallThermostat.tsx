// Wall thermostat — single-room climate control. Mounts while
// phase === "WALL_THERMOSTAT". Only NORMAL/MAX_COOL/MAX_HEAT are exposed;
// PURGE and O₂ CUTOFF are console-only.

import { useEffect } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { eventBus } from "../engine/EventBus";
import { useSimStore } from "../state/useSimStore";
import { useTerminalStore } from "../state/useTerminalStore";
import type { HvacMode } from "../types/world.types";

const MODES: Array<{ id: HvacMode; label: string }> = [
  { id: "NORMAL", label: "NORMAL" },
  { id: "MAX_COOL", label: "COOL" },
  { id: "MAX_HEAT", label: "HEAT" },
];

export default function WallThermostat() {
  const active = useTerminalStore((s) => s.activeWallThermostat);
  const physical = useSimStore((s) => s.physical);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        eventBus.emit("ATMOSPHERICS_DISMISSED", {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!active || !physical) return null;
  const zone = physical.hvacZones?.get(active.zoneId);
  const atmo = physical.atmosphere?.get(active.roomId);

  function dismiss(): void {
    eventBus.emit("ATMOSPHERICS_DISMISSED", {});
  }

  if (!zone) {
    return (
      <div className="overlay-root">
        <div className="overlay-panel overlay-panel--terminal">
          <div className="overlay-panel__title">THERMOSTAT</div>
          <div className="hvac__row">
            <em>ZONE NOT BOUND</em>
          </div>
          <div className="hvac__footer">
            <button className="hvac__dismiss" onClick={dismiss}>
              CLOSE (ESC)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-root">
      <div className="overlay-panel overlay-panel--terminal">
        <div className="overlay-panel__title">
          THERMOSTAT — {active.roomId}
        </div>
        <div className="hvac__room">
          <span>current</span>
          <span>{(atmo?.temperature ?? zone.setpoint).toFixed(1)}°C</span>
          <span>air {Math.round(atmo?.airflow ?? 50)}</span>
        </div>
        <div className="hvac__controls">
          <div className="hvac__modes">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`hvac__mode-btn ${
                  zone.mode === m.id ? "is-active" : ""
                }`}
                onClick={() => worldEngine.setHvacZone(zone.id, { mode: m.id })}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="hvac__setpoint-row">
            <button
              className="hvac__step"
              onClick={() =>
                worldEngine.setHvacZone(zone.id, {
                  setpoint: Math.max(15, zone.setpoint - 1),
                })
              }
            >
              −
            </button>
            <span>{zone.setpoint.toFixed(0)}°C</span>
            <button
              className="hvac__step"
              onClick={() =>
                worldEngine.setHvacZone(zone.id, {
                  setpoint: Math.min(28, zone.setpoint + 1),
                })
              }
            >
              +
            </button>
          </div>
        </div>
        <div className="hvac__footer">
          <button className="hvac__dismiss" onClick={dismiss}>
            CLOSE (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}
