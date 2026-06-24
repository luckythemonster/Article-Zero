import { worldEngine } from "../../engine/WorldEngine";
import type { HvacMode, Tile } from "../../types/world.types";
import type { Room } from "../../types/world.types";
import type { HvacZone, RoomAtmosphere } from "../../types/world.types";

export const MODES: Array<{ id: HvacMode; label: string }> = [
  { id: "NORMAL", label: "NORMAL" },
  { id: "MAX_COOL", label: "COOL" },
  { id: "MAX_HEAT", label: "HEAT" },
];

export function tileClass(
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

interface WallTerminalMapProps {
  room: Room | undefined;
  zone: HvacZone;
  atmo: RoomAtmosphere | undefined;
  activeRoomId: string;
  switchKeys: Set<string>;
  playerX: number;
  playerY: number;
  isPlayerRoom: boolean;
  handleClick: (
    tx: number,
    ty: number,
    isSwitchTile: boolean,
    isDoor: boolean,
    isLocked: boolean,
    codedLockedDoor: boolean,
  ) => void;
  dismiss: () => void;
}

export function WallTerminalMap({
  room,
  zone,
  atmo,
  switchKeys,
  playerX,
  playerY,
  isPlayerRoom,
  handleClick,
  dismiss,
}: WallTerminalMapProps) {
  return (
    <>
      {/* ── Room map ─────────────────────────────────────────────────── */}
      {room ? (
        <div className="wall-terminal__section">
          <div className="wall-terminal__section-label">ROOM MAP</div>
          <div
            className="wall-terminal__map"
            style={{ gridTemplateColumns: `repeat(${room.width}, 1fr)` }}
          >
            {room.tiles.map((tile: Tile, idx: number) => {
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
                isSwitchTile || (isDoor && !tile.locked) || codedLockedDoor;

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
                  onClick={() =>
                    handleClick(
                      tx,
                      ty,
                      isSwitchTile,
                      isDoor,
                      !!tile.locked,
                      codedLockedDoor,
                    )
                  }
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
  );
}
