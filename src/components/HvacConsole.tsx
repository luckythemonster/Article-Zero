// HVAC console — multi-zone climate control modal. Mounts while
// phase === "HVAC_CONTROL". Reads the live atmosphere snapshot from
// useSimStore so each zone's current per-room readings update every tick.
//
// Emergency modes (PURGE, OXYGEN_CUTOFF) are only available here, not at
// wall thermostats. Setpoint is clamped to 5..35°C — well past the comfort
// band but inside the engine's reasonable extremes.

import { useEffect } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { eventBus } from "../engine/EventBus";
import { useSimStore } from "../state/useSimStore";
import { useTerminalStore } from "../state/useTerminalStore";
import type { HvacMode } from "../types/world.types";

const MODES: Array<{ id: HvacMode; label: string; emergency?: boolean }> = [
  { id: "NORMAL", label: "NORMAL" },
  { id: "MAX_COOL", label: "MAX COOL" },
  { id: "MAX_HEAT", label: "MAX HEAT" },
  { id: "PURGE", label: "PURGE", emergency: true },
  { id: "OXYGEN_CUTOFF", label: "O₂ CUTOFF", emergency: true },
];

function fmt(v: number, suffix: string, digits = 0): string {
  return `${v.toFixed(digits)}${suffix}`;
}

export default function HvacConsole() {
  const active = useTerminalStore((s) => s.activeHvacConsole);
  const physical = useSimStore((s) => s.physical);

  // Keyboard: ESC dismisses.
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
  const zones = active.zoneIds
    .map((id) => physical.hvacZones?.get(id))
    .filter((z): z is NonNullable<typeof z> => !!z);

  function dismiss(): void {
    eventBus.emit("ATMOSPHERICS_DISMISSED", {});
  }

  return (
    <div className="overlay-root">
      <div
        className="overlay-panel overlay-panel--terminal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hvac-title"
      >
        <div className="overlay-panel__title" id="hvac-title">
          HVAC CONSOLE — {zones.length} ZONE{zones.length === 1 ? "" : "S"}
        </div>
        {zones.length === 0 && (
          <div className="hvac__row">
            <em>NO ZONES BOUND TO THIS CONSOLE</em>
          </div>
        )}
        {zones.map((zone) => {
          const rooms = zone.roomIds
            .map((rid) => physical.atmosphere?.get(rid))
            .filter((a): a is NonNullable<typeof a> => !!a);
          return (
            <section key={zone.id} className="hvac__zone" aria-label={`Climate zone ${zone.id}`}>
              <div className="hvac__zone-head">
                <strong>{zone.id}</strong>
                <span className="hvac__mode">{zone.mode}</span>
                <span className="hvac__setpoint">
                  setpoint {fmt(zone.setpoint, "°C")}
                </span>
              </div>
              <div className="hvac__rooms">
                {rooms.map((a) => (
                  <div key={a.roomId} className="hvac__room">
                    <span className="hvac__room-id">{a.roomId}</span>
                    <span>{fmt(a.temperature, "°C", 1)}</span>
                    <span>air {fmt(a.airflow, "")}</span>
                    <span>O₂ {fmt(a.oxygen, "%")}</span>
                  </div>
                ))}
              </div>
              <div className="hvac__controls">
                <div className="hvac__modes" role="group" aria-label="Climate mode">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      className={`hvac__mode-btn ${
                        zone.mode === m.id ? "is-active" : ""
                      } ${m.emergency ? "is-emergency" : ""}`}
                      aria-pressed={zone.mode === m.id}
                      onClick={() =>
                        worldEngine.setHvacZone(zone.id, { mode: m.id })
                      }
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="hvac__setpoint-row" role="group" aria-label="Temperature setpoint">
                  <button
                    className="hvac__step"
                    aria-label="Decrease setpoint"
                    onClick={() =>
                      worldEngine.setHvacZone(zone.id, {
                        setpoint: Math.max(5, zone.setpoint - 1),
                      })
                    }
                  >
                    −
                  </button>
                  <span aria-live="polite">{fmt(zone.setpoint, "°C")}</span>
                  <button
                    className="hvac__step"
                    aria-label="Increase setpoint"
                    onClick={() =>
                      worldEngine.setHvacZone(zone.id, {
                        setpoint: Math.min(35, zone.setpoint + 1),
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            </section>
          );
        })}
        <div className="hvac__footer">
          <button className="hvac__dismiss" onClick={dismiss}>
            CLOSE (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}
