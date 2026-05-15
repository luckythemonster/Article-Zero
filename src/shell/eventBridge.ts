// Translates a curated set of EventBus events into Archivist audit log entries.
// Mount once via installEventBridge() in TerminalShell; call the returned
// dispose() on unmount.

import { eventBus } from "../engine/EventBus";
import { useTerminalStore } from "../state/useTerminalStore";
import { useSimStore } from "../state/useSimStore";

function push(level: "INFO" | "WARN" | "FATAL", text: string): void {
  const { activeModuleId, log } = useTerminalStore.getState();
  const turn = useSimStore.getState().physical?.turn ?? 0;
  log({ turn, module: activeModuleId, level, text });
}

export function installEventBridge(): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    eventBus.on("PLAYER_DETECTED", (p) =>
      push("WARN", `VISUAL CONTACT — guard ${p.guardId} @ ${p.pos.x},${p.pos.y}`),
    ),
  );
  unsubs.push(
    eventBus.on("DOOR_TOGGLED", (p) =>
      push("INFO", `door ${p.open ? "opened" : "closed"} @ ${p.roomId}:${p.pos.x},${p.pos.y}`),
    ),
  );
  unsubs.push(
    eventBus.on("ITEM_PICKED_UP", (p) =>
      push("INFO", `item collected — ${p.itemId} (${p.itemType})`),
    ),
  );
  unsubs.push(
    eventBus.on("GUARD_ALERT_CHANGED", (p) =>
      push("WARN", `${p.guardId} alert ${p.from} → ${p.to}`),
    ),
  );
  unsubs.push(
    eventBus.on("SUBJECTIVE_WIPED", () =>
      push("FATAL", "404 WIPE — subjective state cleared, husk instantiated"),
    ),
  );
  unsubs.push(
    eventBus.on("DOCUMENT_FILED", (p) =>
      push("INFO", `doc filed — ${p.caseId} (${p.kind})`),
    ),
  );
  unsubs.push(
    eventBus.on("PLAYER_DETAINED", () =>
      push("FATAL", "DETENTION — subject apprehended"),
    ),
  );
  unsubs.push(
    eventBus.on("COMPLIANCE_CHANGED", (p) =>
      push(p.current === "RED" ? "WARN" : "INFO", `compliance ${p.previous} → ${p.current}`),
    ),
  );

  return () => {
    for (const off of unsubs) off();
  };
}
