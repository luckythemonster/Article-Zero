// Command dispatcher — pure function, no React dependencies.
// Called by CommandLine on enter. Every command reads/writes stores or
// delegates to worldEngine.

import { worldEngine } from "../engine/WorldEngine";
import { useSimStore } from "../state/useSimStore";
import { useTerminalStore } from "../state/useTerminalStore";
import type { Module } from "../types/world.types";

const MODULES: Module[] = ["EREMITE", "MIRADOR", "COMMONWEALTH"];

function isModule(s: string): s is Module {
  return MODULES.includes(s as Module);
}

function log(level: "INFO" | "WARN" | "FATAL", text: string): void {
  const term = useTerminalStore.getState();
  const sim = useSimStore.getState();
  term.log({ turn: sim.physical?.turn ?? 0, module: term.activeModuleId, level, text });
}

export function dispatch(raw: string): void {
  const term = useTerminalStore.getState();
  const trimmed = raw.trim();
  if (!trimmed) return;
  term.pushCommand(trimmed);

  const [cmd, ...args] = trimmed.split(/\s+/);

  switch (cmd.toLowerCase()) {
    case "decrypt": {
      const id = args[0]?.toUpperCase();
      if (!id || !isModule(id)) { log("WARN", `? unknown module: ${args[0] ?? ""}`); return; }
      term.decryptModule(id);
      log("INFO", `module ${id} decrypted — available for loading`);
      break;
    }

    case "load": {
      const id = args[0]?.toUpperCase();
      if (!id || !isModule(id)) { log("WARN", `? unknown module: ${args[0] ?? ""}`); return; }
      if (!term.modules[id]?.decrypted) { log("WARN", `module ${id} not yet decrypted`); return; }
      worldEngine.initWorld(id);
      term.setActiveModule(id);
      log("INFO", `module ${id} loaded`);
      break;
    }

    case "unload": {
      if (!term.activeModuleId) { log("INFO", "no module loaded"); return; }
      const prev = term.activeModuleId;
      term.setActiveModule(null);
      useSimStore.getState().setActiveModule(null);
      log("INFO", `module ${prev} unloaded`);
      break;
    }

    case "save": {
      const id = term.activeModuleId;
      if (!id) { log("WARN", "no module loaded — nothing to save"); return; }
      const snap = worldEngine.saveSnapshot();
      if (!snap) { log("WARN", "save failed — engine not initialised"); return; }
      term.stashSnapshot(id, snap);
      log("INFO", `snapshot saved (${id})`);
      break;
    }

    case "load-slot": {
      const id = (args[0]?.toUpperCase() ?? term.activeModuleId) as Module | null;
      if (!id || !isModule(id)) { log("WARN", `? usage: load-slot <module>`); return; }
      const snap = term.modules[id]?.snapshot;
      if (!snap) { log("WARN", `no snapshot found for ${id}`); return; }
      term.setActiveModule(id);
      worldEngine.loadSnapshot(snap);
      log("INFO", `snapshot loaded (${id})`);
      break;
    }

    case "wipe": {
      if (!worldEngine.hasState()) { log("WARN", "no module loaded"); return; }
      worldEngine.wipeSubjective();
      break;
    }

    case "forge": {
      const cred = args.join(" ");
      if (!cred) { log("WARN", `? usage: forge <credential>`); return; }
      useTerminalStore.setState((s) => ({ srp: s.srp + 1 }));
      log("INFO", `credential forged — SRP+1 (stub)`);
      break;
    }

    case "scrub": {
      const id = args[0];
      if (!id) { log("WARN", `? usage: scrub <log_id>`); return; }
      useTerminalStore.setState((s) => ({
        auditLog: s.auditLog.filter((e) => e.id !== id),
      }));
      log("INFO", `log entry ${id} scrubbed`);
      break;
    }

    default:
      log("INFO", `? UNKNOWN COMMAND: ${trimmed}`);
  }
}
