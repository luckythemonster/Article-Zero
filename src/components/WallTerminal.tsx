// Wall terminal — climate control + clickable room map.
// Mounts while phase === "WALL_TERMINAL". NORMAL/MAX_COOL/MAX_HEAT are
// exposed in the climate section; PURGE and O₂ CUTOFF are console-only.
// The room map lets the player toggle light switches and unlocked doors
// without consuming AP (the cost was paid when the terminal was opened).

import { useEffect } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { eventBus } from "../engine/EventBus";
import { useSimStore } from "../state/useSimStore";
import { useTerminalStore } from "../state/useTerminalStore";
import type { HvacMode, Tile } from "../types/world.types";

const MODES: Array<{ id: HvacMode; label: string }> = [
  { id: "NORMAL", label: "NORMAL" },
  { id: "MAX_COOL", label: "COOL" },
  { id: "MAX_HEAT", label: "HEAT" },
];

function tileClass(
  tile: Tile,
  x: number,
  y: number,
  switchKeys: Set<string>,
  playerX: number,
  playerY: number,
): string {
  const base = "wall-terminal__tile";
  const mods: string[] = [];

  if (x === playerX && y === playerY) {
    mods.push("wall-terminal__tile--player");
  } else if (switchKeys.has(`${x},${y}`)) {
    mods.push("wall-terminal__tile--switch");
  } else {
    switch (tile.kind) {
      case "WALL":
        mods.push("wall-terminal__tile--wall");
        break;
      case "DOOR_OPEN":
        mods.push("wall-terminal__tile--door-open");
        break;
      case "DOOR_CLOSED":
        mods.push(
          tile.locked
            ? "wall-terminal__tile--door-locked"
            : "wall-terminal__tile--door-closed",
        );
        break;
      case "LIGHT_SOURCE":
        mods.push(
          tile.lightOn !== false
            ? "wall-terminal__tile--light-on"
            : "wall-terminal__tile--light-off",
        );
        break;
      case "TERMINAL":
      case "EXTRACTION_TERMINAL":
        mods.push("wall-terminal__tile--terminal");
        break;
      case "VENT":
        mods.push("wall-terminal__tile--vent");
        break;
      case "LOCKER":
        mods.push("wall-terminal__tile--locker");
        break;
      case "CHASM":
        mods.push("wall-terminal__tile--chasm");
        break;
      default:
        mods.push("wall-terminal__tile--floor");
    }
  }

  return mods.length ? `${base} ${mods.join(" ")}` : base;
}

export default function WallTerminal() {
  const active = useTerminalStore((s) => s.activeWallTerminal);
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
  const room = physical.rooms?.get(active.roomId);

  function dismiss(): void {
    eventBus.emit("ATMOSPHERICS_DISMISSED", {});
  }

  if (!zone) {
    return (
      <div className="overlay-root">
        <div className="overlay-panel overlay-panel--terminal">
          <div className="overlay-panel__title">WALL TERMINAL</div>
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

  // Build a fast lookup of light-switch positions in this room.
  const switchKeys = new Set<string>();
  for (const sw of room?.lightSwitches ?? []) {
    switchKeys.add(`${sw.pos.x},${sw.pos.y}`);
  }

  const playerX = physical.playerPos.x;
  const playerY = physical.playerPos.y;
  const isPlayerRoom = physical.playerRoomId === active.roomId;

  return (
    <div className="overlay-root">
      <div className="overlay-panel overlay-panel--terminal wall-terminal">
        <div className="overlay-panel__title">
          WALL TERMINAL — {active.roomId}
        </div>

        {/* ── Room map ─────────────────────────────────────────────────── */}
        {room ? (
          <div className="wall-terminal__section">
            <div className="wall-terminal__section-label">ROOM MAP</div>
            <div
              className="wall-terminal__map"
              style={{ gridTemplateColumns: `repeat(${room.width}, 1fr)` }}
            >
              {room.tiles.map((tile, idx) => {
                const tx = idx % room.width;
                const ty = Math.floor(idx / room.width);
                const isSwitchTile = switchKeys.has(`${tx},${ty}`);
                const isDoor =
                  tile.kind === "DOOR_OPEN" || tile.kind === "DOOR_CLOSED";
                const clickable =
                  isSwitchTile || (isDoor && !tile.locked);

                function handleClick() {
                  if (!clickable) return;
                  if (isSwitchTile) {
                    worldEngine.toggleLightSwitch(active!.roomId, {
                      x: tx,
                      y: ty,
                    });
                  } else if (isDoor && !tile.locked) {
                    worldEngine.toggleDoorTile(active!.roomId, {
                      x: tx,
                      y: ty,
                    });
                  }
                }

                return (
                  <div
                    key={idx}
                    className={
                      tileClass(
                        tile,
                        tx,
                        ty,
                        switchKeys,
                        isPlayerRoom ? playerX : -1,
                        isPlayerRoom ? playerY : -1,
                      ) + (clickable ? " wall-terminal__tile--clickable" : "")
                    }
                    onClick={handleClick}
                    title={
                      isSwitchTile
                        ? "LIGHT SWITCH — click to toggle"
                        : isDoor && !tile.locked
                          ? `DOOR — click to ${tile.kind === "DOOR_OPEN" ? "close" : "open"}`
                          : tile.kind
                    }
                  />
                );
              })}
            </div>
            <div className="wall-terminal__map-legend">
              <span className="wall-terminal__legend-item wall-terminal__legend--switch">SW</span>
              <span className="wall-terminal__legend-item wall-terminal__legend--door-closed">D</span>
              <span className="wall-terminal__legend-item wall-terminal__legend--light-on">LT</span>
              <span className="wall-terminal__legend-item wall-terminal__legend--player">PL</span>
            </div>
          </div>
        ) : null}

        {/* ── Climate controls ─────────────────────────────────────────── */}
        <div className="wall-terminal__section">
          <div className="wall-terminal__section-label">CLIMATE</div>
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
                  onClick={() =>
                    worldEngine.setHvacZone(zone.id, { mode: m.id })
                  }
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
