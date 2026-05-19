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
      push("WARN", `VISUAL CONTACT — auditor ${p.guardId} @ ${p.pos.x},${p.pos.y}`),
    ),
  );
  unsubs.push(
    eventBus.on("PLAYER_STANCE_CHANGED", (p) =>
      push("INFO", `stance: ${p.stance.toLowerCase()}`),
    ),
  );
  unsubs.push(
    eventBus.on("INTERACT_REJECTED", (p) => {
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
    eventBus.on("GUARD_ALERT_CHANGED", (p) =>
      push(p.to === "ALERT" ? "WARN" : "INFO", `${p.guardId} alert ${p.from} → ${p.to}`),
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

  return () => {
    for (const off of unsubs) off();
    if (lockdownTimer !== null) {
      window.clearTimeout(lockdownTimer);
      lockdownTimer = null;
    }
  };
}
