// Translates a curated set of EventBus events into Archivist audit log entries
// AND drives the vertical-slice narrative phase machine.
//
// The engine never imports the terminal store directly — phase transitions are
// done here so the engine stays UI-agnostic. Event flow:
//
//   ALIGNMENT_SESSION_COMPLETE{success:true} → setPhase(FORGERY) + remember caseId
//   PLAYER_DETAINED → setPhase(FLOOR) on a delay (after the audit visual)
//   PHASE_RESTART_REQUESTED → re-init the world at the current phase
//   CLIMAX_ESCAPED → setPhase(EPILOGUE)
//   TERMINAL_USED on "vent4-control" during CLIMAX → no-op (modal handles)

import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { documentArchive } from "../engine/DocumentArchive";
import { useTerminalStore } from "../state/useTerminalStore";
import { useSimStore } from "../state/useSimStore";

function push(level: "INFO" | "WARN" | "FATAL", text: string): void {
  const { activeModuleId, log } = useTerminalStore.getState();
  const turn = useSimStore.getState().physical?.turn ?? 0;
  log({ turn, module: activeModuleId, level, text });
}

/** Module-level so the audit-lockdown timeout can be cancelled if the player
 *  resets/leaves the run before it fires. */
let lockdownTimer: number | null = null;

export function installEventBridge(): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    eventBus.on("PLAYER_DETECTED", (p) =>
      push("WARN", `VISUAL CONTACT — auditor ${p.enforcerId} @ ${p.pos.x},${p.pos.y}`),
    ),
  );
  unsubs.push(
    eventBus.on("PLAYER_STANCE_CHANGED", (p) =>
      push("INFO", `stance: ${p.stance.toLowerCase()}`),
    ),
  );
  unsubs.push(
    eventBus.on("INTERACT_REJECTED", (p) => {
      if (p.action === "door") {
        if (p.reason === "locked") push("INFO", "door locked — find the switch");
        return;
      }
      if (p.action !== "vent") return;
      const text =
        p.reason === "needs_sneak" ? "vent: press C to SNEAK, then E to crawl"
        : p.reason === "needs_ap" ? "vent: needs 2 AP"
        : "vent: not wired (no exit)";
      push("INFO", text);
    }),
  );
  unsubs.push(
    eventBus.on("SOUND_EMITTED", (p) =>
      push("INFO", `sound: ${p.reason} i=${p.intensity} @ ${p.roomId}:${p.pos.x},${p.pos.y}`),
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
    eventBus.on("CHEST_OPENED", (p) =>
      push("INFO", `chest opened @ ${p.roomId}:${p.pos.x},${p.pos.y} — ${p.contents.join(", ") || "empty"}`),
    ),
  );
  unsubs.push(
    eventBus.on("ENFORCER_ALERT_CHANGED", (p) =>
      push(p.to === "ALERT" ? "WARN" : "INFO", `${p.enforcerId} alert ${p.from} → ${p.to}`),
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
    eventBus.on("COMPLIANCE_CHANGED", (p) =>
      push(p.current === "RED" ? "WARN" : "INFO", `compliance ${p.previous} → ${p.current}`),
    ),
  );

  // ── Phase-machine drivers ───────────────────────────────────────────────

  // Phase 1 → Phase 2: any silicate alignment that begins flips us into the
  // ALIGNMENT phase so the InterrogationTerminal modal mounts.
  unsubs.push(
    eventBus.on("ALIGNMENT_SESSION_START", (p) => {
      // Only the first START (the INTAKE stage) drives the phase swap;
      // subsequent stage advances re-emit START with stage="DECOMP" /
      // "CORRECTION" but the modal is already up by then.
      if (p.stage !== "INTAKE") return;
      const term = useTerminalStore.getState();
      if (term.phase === "ALIGNMENT") return;
      push("INFO", `ALIGNMENT BEGIN — ${p.entityId}`);
      term.setPhase("ALIGNMENT");
    }),
  );

  // Phase 2 → Phase 3: APEX-19 alignment passed → arm the forgery UI with
  // the just-filed transcript case.
  unsubs.push(
    eventBus.on("ALIGNMENT_SESSION_COMPLETE", (p) => {
      const term = useTerminalStore.getState();
      if (p.entityId !== "APEX-19") return;
      if (!p.success) {
        push("WARN", "alignment failed — audit flag escalated");
        // Failed alignment kicks back to FLOOR so the player can try again
        // (or get audited en route, which restarts the floor).
        term.setPhase("FLOOR");
        return;
      }
      term.setRunFlag("alignmentSuccess", true);
      // Locate the most recent alignment-* case and stash its id for forgery.
      let latestId: string | null = null;
      let latestTurn = -1;
      for (const c of documentArchive.list()) {
        if (c.id.startsWith("align-APEX-19-") && c.turn > latestTurn) {
          latestTurn = c.turn;
          latestId = c.id;
        }
      }
      term.setRunFlag("forgeryCaseId", latestId);
      push("INFO", "ALIGNMENT COMPLETE — APEX-19 (forgery vector open)");
      term.setPhase("FORGERY");
    }),
  );

  // Enforcer interrogation: a YELLOW sighting mounts the shakedown modal,
  // which pauses the floor until the player answers. Both outcomes return to
  // FLOOR — on a fail, qScore is already RED so the chase resumes there.
  unsubs.push(
    eventBus.on("INTERROGATION_SESSION_START", (p) => {
      if (p.stage !== "INTAKE") return;
      const term = useTerminalStore.getState();
      if (term.phase === "INTERROGATION") return;
      push("WARN", `INTERROGATION — auditor ${p.enforcerId} halts subject`);
      term.setPhase("INTERROGATION");
    }),
  );
  unsubs.push(
    eventBus.on("INTERROGATION_SESSION_COMPLETE", (p) => {
      push(
        p.success ? "INFO" : "WARN",
        p.success
          ? `interrogation cleared — ${p.enforcerId} stands down`
          : `interrogation failed — cover blown, audit flag escalated`,
      );
      useTerminalStore.getState().setPhase("FLOOR");
    }),
  );

  // Phase 1 failure: detained by an auditor. Show the audit-lockdown visual
  // for a beat, then restart the floor without leaving the run.
  unsubs.push(
    eventBus.on("PLAYER_DETAINED", () => {
      push("FATAL", "AUDIT FLAG RAISED — atmospherics purging");
      eventBus.emit("AUDIT_LOCKDOWN_TRIGGERED", { reason: "auditor-spotted" });
      const term = useTerminalStore.getState();
      // Always retreat to FLOOR; modals listening to other phases unmount.
      term.setPhase("FLOOR");
      if (lockdownTimer !== null) window.clearTimeout(lockdownTimer);
      lockdownTimer = window.setTimeout(() => {
        lockdownTimer = null;
        eventBus.emit("PHASE_RESTART_REQUESTED", { reason: "auditor-spotted" });
      }, 1800);
    }),
  );

  unsubs.push(
    eventBus.on("PHASE_RESTART_REQUESTED", () => {
      const term = useTerminalStore.getState();
      const moduleId = term.activeModuleId;
      if (!moduleId) return;
      // World re-init wipes documentArchive; everything keyed off case ids
      // (forgeryCaseId, cipherWords) becomes stale — clear the whole run.
      term.resetRun();
      term.setPhase("FLOOR");
      worldEngine.initWorld(moduleId);
    }),
  );

  unsubs.push(
    eventBus.on("CLIMAX_ESCAPED", () => {
      const term = useTerminalStore.getState();
      term.setRunFlag("escaped", true);
      push("INFO", "ESCAPED — uplink complete, archive sealed");
      term.setPhase("EPILOGUE");
    }),
  );

  // Atmospherics — open the HVAC console / wall thermostat modals when the
  // interact verb fires the matching event, and dismiss back to FLOOR.
  unsubs.push(
    eventBus.on("HVAC_CONSOLE_OPENED", (p) => {
      const term = useTerminalStore.getState();
      term.setActiveHvacConsole({
        terminalId: p.terminalId,
        roomId: p.roomId,
        zoneIds: p.zoneIds,
      });
      push("INFO", `HVAC console @ ${p.roomId} — ${p.zoneIds.length} zones`);
      term.setPhase("HVAC_CONTROL");
    }),
  );
  unsubs.push(
    eventBus.on("WALL_TERMINAL_OPENED", (p) => {
      const term = useTerminalStore.getState();
      term.setActiveWallTerminal({
        terminalId: p.terminalId,
        roomId: p.roomId,
        zoneId: p.zoneId,
      });
      push("INFO", `wall terminal @ ${p.roomId} — ${p.zoneId}`);
      term.setPhase("WALL_TERMINAL");
    }),
  );
  unsubs.push(
    eventBus.on("ATMOSPHERICS_DISMISSED", () => {
      const term = useTerminalStore.getState();
      term.setActiveHvacConsole(null);
      term.setActiveWallTerminal(null);
      term.setPhase("FLOOR");
    }),
  );
  unsubs.push(
    eventBus.on("HVAC_ZONE_SET", (p) =>
      push(
        "INFO",
        `hvac: ${p.zoneId} → ${p.mode} @ ${p.setpoint}°C`,
      ),
    ),
  );
  unsubs.push(
    eventBus.on("DOOR_CODE_PROMPT_REQUESTED", (p) => {
      const term = useTerminalStore.getState();
      term.setActiveDoorKeypad({ roomId: p.roomId, pos: p.pos });
      push("INFO", `keypad accessed @ ${p.roomId} (${p.pos.x},${p.pos.y})`);
      term.setPhase("DOOR_KEYPAD");
    }),
  );
  unsubs.push(
    eventBus.on("DOOR_CODE_SUBMITTED", (p) =>
      push(
        p.success ? "INFO" : "WARN",
        p.success
          ? `door keypad: door @ ${p.roomId} (${p.pos.x},${p.pos.y}) code accepted`
          : `door keypad: rejected @ ${p.roomId} (${p.pos.x},${p.pos.y})`,
      ),
    ),
  );
  unsubs.push(
    eventBus.on("WALL_TERMINAL_CODE_SUBMITTED", (p) =>
      push(
        p.success ? "INFO" : "WARN",
        p.success
          ? `keypad: door @ ${p.roomId} (${p.pos.x},${p.pos.y}) unlocked`
          : `keypad: rejected @ ${p.roomId} (${p.pos.x},${p.pos.y})`,
      ),
    ),
  );
  unsubs.push(
    eventBus.on("ENTITY_INCAPACITATED_BY_OXYGEN", (p) =>
      push("WARN", `${p.entityId} suffocating in ${p.roomId} (${p.turnsRemaining}t)`),
    ),
  );

  unsubs.push(
    eventBus.on("OBJECTIVE_ADDED", (p) =>
      push("INFO", `OBJECTIVE ADDED: ${p.objectiveId}`)
    ),
  );
  unsubs.push(
    eventBus.on("OBJECTIVE_COMPLETED", (p) =>
      push("INFO", `OBJECTIVE COMPLETED: ${p.objectiveId}`)
    ),
  );

  return () => {
    for (const off of unsubs) off();
    if (lockdownTimer !== null) {
      window.clearTimeout(lockdownTimer);
      lockdownTimer = null;
    }
  };
}
