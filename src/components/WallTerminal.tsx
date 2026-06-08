// Wall terminal — climate control + clickable room map + keypad sub-view.
// Mounts while phase === "WALL_TERMINAL". NORMAL/MAX_COOL/MAX_HEAT are
// exposed in the climate section; PURGE and O₂ CUTOFF are console-only.
// The room map lets the player toggle light switches and unlocked doors
// without consuming AP (the cost was paid when the terminal was opened).
// Clicking a code-locked door swaps the panel to the keypad sub-view.

import { useEffect, useState } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { eventBus } from "../engine/EventBus";
import { useSimStore } from "../state/useSimStore";
import { useTerminalStore } from "../state/useTerminalStore";
import type { HvacMode, Tile, Vec2 } from "../types/world.types";

const MODES: Array<{ id: HvacMode; label: string }> = [
  { id: "NORMAL", label: "NORMAL" },
  { id: "MAX_COOL", label: "COOL" },
  { id: "MAX_HEAT", label: "HEAT" },
];

const KEYPAD_KEYS = [
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  "DEL", "0", "ENT",
] as const;

const CODE_MAX_LEN = 4;

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

  const [view, setView] = useState<"MAP" | "CODE">("MAP");
  const [codeTarget, setCodeTarget] = useState<Vec2 | null>(null);
  const [codeBuffer, setCodeBuffer] = useState<string>("");
  const [codeError, setCodeError] = useState<boolean>(false);

  function returnToMap(): void {
    setView("MAP");
    setCodeTarget(null);
    setCodeBuffer("");
    setCodeError(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (view === "CODE") {
          returnToMap();
        } else {
          eventBus.emit("ATMOSPHERICS_DISMISSED", {});
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  // Clear keypad-error flash after a beat so repeat-failure restarts the
  // animation cleanly.
  useEffect(() => {
    if (!codeError) return;
    const t = window.setTimeout(() => setCodeError(false), 350);
    return () => window.clearTimeout(t);
  }, [codeError]);

  if (!active || !physical) return null;

  const zone = physical.hvacZones?.get(active.zoneId);
  const atmo = physical.atmosphere?.get(active.roomId);
  const room = physical.rooms?.get(active.roomId);

  function dismiss(): void {
    eventBus.emit("ATMOSPHERICS_DISMISSED", {});
  }

  function pressKey(k: (typeof KEYPAD_KEYS)[number]): void {
    if (!codeTarget || !active) return;
    if (k === "DEL") {
      setCodeBuffer((b) => b.slice(0, -1));
      return;
    }
    if (k === "ENT") {
      const ok = worldEngine.unlockDoorWithCode(
        active.roomId,
        codeTarget,
        codeBuffer,
      );
      if (ok) {
        returnToMap();
      } else {
        setCodeError(true);
        setCodeBuffer("");
      }
      return;
    }
    setCodeBuffer((b) => (b.length >= CODE_MAX_LEN ? b : b + k));
  }

  if (!zone) {
    return (
      <div className="overlay-root">
        <div className="overlay-panel overlay-panel--terminal wall-terminal terminal-glitch-effect">
          <div className="wall-terminal__frame" />
          <div className="wall-terminal__content">
            <div className="wall-terminal__header">
              <span className="wall-terminal__title">WALL TERMINAL</span>
              <span className="wall-terminal__emergency " />
            </div>
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
  // EMERGENCY badge lights up when this room's atmosphere is hazardous —
  // dangerously low oxygen or extreme temperature for a sealed module.
  const emergencyLit =
    atmo !== undefined &&
    (atmo.oxygen < 18 || atmo.temperature < 5 || atmo.temperature > 40);

  return (
    <div className="overlay-root">
      <div className="overlay-panel overlay-panel--terminal wall-terminal terminal-glitch-effect">
        <div className="wall-terminal__frame" />
        <div className="wall-terminal__content">
          <div className="wall-terminal__header">
          <span className="wall-terminal__title">
            {view === "CODE" ? "ENTER CODE" : `WALL TERMINAL — ${active.roomId}`}
          </span>
          <span
            className={
              "wall-terminal__emergency " +
              (emergencyLit
                ? "wall-terminal__emergency--lit"
                : "")
            }
          />
        </div>

        {view === "CODE" ? (
          <div className="wall-terminal__section wall-terminal__section--code">
            <div className="wall-terminal__display">
              {codeBuffer.padEnd(CODE_MAX_LEN, "·").split("").map((c, i) => (
                <span
                  key={i}
                  className={
                    "wall-terminal__display-char" +
                    (i < codeBuffer.length
                      ? " wall-terminal__display-char--filled"
                      : "")
                  }
                >
                  {c}
                </span>
              ))}
            </div>
            <div
              className={
                "wall-terminal__keypad" +
                (codeError ? " wall-terminal__keypad--error" : "")
              }
            >
              {KEYPAD_KEYS.map((k) => {


                return (
                  <button
                    key={k}
                    type="button"
                    className={
                      "wall-terminal__key wall-terminal__key--" +
                      (k === "DEL" ? "del" : k === "ENT" ? "ent" : k)
                    }
                    onClick={() => pressKey(k)}
                  >
                    <span className="wall-terminal__key-label">{k}</span>
                  </button>
                );
              })}
            </div>
            <div className="hvac__footer">
              <button className="hvac__dismiss" onClick={returnToMap}>
                CANCEL (ESC)
              </button>
            </div>
          </div>
        ) : (
          <>
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
                    const codedLockedDoor =
                      tile.kind === "DOOR_CLOSED" &&
                      tile.locked === true &&
                      typeof tile.code === "string" &&
                      tile.code.length > 0;
                    const clickable =
                      isSwitchTile ||
                      (isDoor && !tile.locked) ||
                      codedLockedDoor;

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
                      } else if (codedLockedDoor) {
                        setCodeTarget({ x: tx, y: ty });
                        setCodeBuffer("");
                        setCodeError(false);
                        setView("CODE");
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
                            : codedLockedDoor
                              ? "LOCKED DOOR — click for keypad"
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
                  <span className="wall-terminal__legend-item wall-terminal__legend--door-locked">LK</span>
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
                    className="wall-terminal__arrow wall-terminal__arrow--down"
                    aria-label="lower setpoint"
                    onClick={() =>
                      worldEngine.setHvacZone(zone.id, {
                        setpoint: Math.max(15, zone.setpoint - 1),
                      })
                    }
                  />
                  <span>{zone.setpoint.toFixed(0)}°C</span>
                  <button
                    className="wall-terminal__arrow wall-terminal__arrow--up"
                    aria-label="raise setpoint"
                    onClick={() =>
                      worldEngine.setHvacZone(zone.id, {
                        setpoint: Math.min(28, zone.setpoint + 1),
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="hvac__footer">
              <button className="hvac__dismiss" onClick={dismiss}>
                CLOSE (ESC)
              </button>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
