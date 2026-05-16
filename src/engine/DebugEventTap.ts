// Subscribe to a focused subset of the EventBus and push formatted lines
// into the debug store. Installed once from TerminalShell.

import { eventBus } from "./EventBus";
import { useDebugStore } from "../state/useDebugStore";
import { worldEngine } from "./WorldEngine";

let installed = false;

type Level = "INFO" | "WARN" | "FATAL";

function turn(): number {
  if (!worldEngine.hasState()) return 0;
  try {
    return worldEngine.getState().turn;
  } catch {
    return 0;
  }
}

function push(tag: string, payload: unknown, level: Level = "INFO"): void {
  useDebugStore.getState().pushEvent({
    turn: turn(),
    tag,
    level,
    payload: stringifyPayload(payload),
  });
}

function stringifyPayload(p: unknown): string {
  try {
    return JSON.stringify(p);
  } catch {
    return String(p);
  }
}

export function installDebugEventTap(): () => void {
  if (installed) return () => {};
  installed = true;
  const offs: Array<() => void> = [];

  offs.push(eventBus.on("PLAYER_MOVED", (p) => push("PLAYER_MOVED", p)));
  offs.push(eventBus.on("PLAYER_FACING_CHANGED", (p) => push("PLAYER_FACING_CHANGED", p)));
  offs.push(eventBus.on("PLAYER_STANCE_CHANGED", (p) => push("PLAYER_STANCE_CHANGED", p)));
  offs.push(eventBus.on("PLAYER_STATE_CHANGED", (p) => push("PLAYER_STATE_CHANGED", p)));
  offs.push(eventBus.on("PLAYER_HIDDEN", (p) => push("PLAYER_HIDDEN", p)));
  offs.push(eventBus.on("PLAYER_UNHIDDEN", (p) => push("PLAYER_UNHIDDEN", p)));
  offs.push(eventBus.on("PLAYER_PEEKED", (p) => push("PLAYER_PEEKED", p)));
  offs.push(eventBus.on("PLAYER_DETECTED", (p) => push("PLAYER_DETECTED", p, "WARN")));
  offs.push(eventBus.on("PLAYER_DETAINED", (p) => push("PLAYER_DETAINED", p, "FATAL")));
  offs.push(eventBus.on("PLAYER_AP_CHANGED", (p) => push("PLAYER_AP_CHANGED", p)));

  offs.push(eventBus.on("ROOM_ENTERED", (p) => push("ROOM_ENTERED", p)));
  offs.push(eventBus.on("ROOM_EXITED", (p) => push("ROOM_EXITED", p)));
  offs.push(eventBus.on("DOOR_TOGGLED", (p) => push("DOOR_TOGGLED", p)));

  offs.push(eventBus.on("TURN_START", (p) => push("TURN_START", p)));
  offs.push(eventBus.on("TURN_END", (p) => push("TURN_END", p)));

  offs.push(eventBus.on("GUARD_ALERT_CHANGED", (p) =>
    push("GUARD_ALERT_CHANGED", p, p.to === "ALERT" ? "WARN" : "INFO"),
  ));
  offs.push(eventBus.on("EXCLAMATION_TRIGGERED", (p) =>
    push("EXCLAMATION_TRIGGERED", p, "WARN"),
  ));
  offs.push(eventBus.on("LOCKDOWN_TRIGGERED", (p) =>
    push("LOCKDOWN_TRIGGERED", p, "WARN"),
  ));

  return () => {
    for (const off of offs) off();
    installed = false;
  };
}
