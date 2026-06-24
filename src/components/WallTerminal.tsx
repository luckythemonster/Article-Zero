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
import type { Vec2 } from "../types/world.types";
import { WallTerminalCode, KEYPAD_KEYS, CODE_MAX_LEN } from "./WallTerminal/WallTerminalCode";
import { WallTerminalMap } from "./WallTerminal/WallTerminalMap";

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
    if (codeError) {
      const t = setTimeout(() => setCodeError(false), 500);
      return () => clearTimeout(t);
    }
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

  function handleMapClick(
    tx: number,
    ty: number,
    isSwitchTile: boolean,
    isDoor: boolean,
    isLocked: boolean,
    codedLockedDoor: boolean,
  ) {
    if (isSwitchTile) {
      worldEngine.toggleLightSwitch(active!.roomId, {
        x: tx,
        y: ty,
      });
    } else if (isDoor && !isLocked) {
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

  if (!zone) {
    return (
      <div className="overlay-root">
        <div className="overlay-panel overlay-panel--terminal wall-terminal">
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
      <div className="overlay-panel overlay-panel--terminal wall-terminal">
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
            <WallTerminalCode
              codeBuffer={codeBuffer}
              codeError={codeError}
              pressKey={pressKey}
              returnToMap={returnToMap}
            />
          ) : (
            <WallTerminalMap
              room={room}
              zone={zone}
              atmo={atmo}
              activeRoomId={active.roomId}
              switchKeys={switchKeys}
              playerX={playerX}
              playerY={playerY}
              isPlayerRoom={isPlayerRoom}
              handleClick={handleMapClick}
              dismiss={dismiss}
            />
          )}
        </div>
      </div>
    </div>
  );
}
