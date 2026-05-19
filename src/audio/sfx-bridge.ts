// Bridges typed engine events into the one-shot SFX player. Two paths:
//
//   1. SOUND_EMITTED with a reason the footstep bridge doesn't handle
//      (door, locker, light_toggle, knock, pry-lockdown). The footstep
//      bridge silently drops these; we pick them up here and play the
//      matching jsfxr sound.
//
//   2. Direct game events (LOCKDOWN_TRIGGERED, EXCLAMATION_TRIGGERED,
//      etc.) that have no SoundField intent but warrant a UI/foreground
//      cue. These are wired one-by-one with hand-picked SFX from the
//      11-def staging set.
//
// Install from PhaserCanvas.tsx alongside the footstep + music bridges
// so the subscription survives the eventBus.clear() on canvas remount.

import { eventBus } from "../engine/EventBus";
import { sfx } from "./Sfx";

const SOUND_REASON_TO_SFX: Record<string, { name: string; volume?: number }> = {
  door:           { name: "knock",        volume: 0.55 },
  locker:         { name: "knock",        volume: 0.35 },
  light_toggle:   { name: "light switch", volume: 0.7  },
  knock:          { name: "knock",        volume: 0.85 },
  "pry-lockdown": { name: "EMP",          volume: 0.6  },
};

interface BridgeStats {
  received: number;
  played: number;
  byReason: Record<string, number>;
  lastEvent: string | null;
  lastSfx: string | null;
}

const bridgeStats: BridgeStats = {
  received: 0,
  played: 0,
  byReason: {},
  lastEvent: null,
  lastSfx: null,
};

export function getSfxBridgeStats(): BridgeStats {
  return { ...bridgeStats, byReason: { ...bridgeStats.byReason } };
}

function fire(name: string, volume?: number, eventTag?: string): void {
  bridgeStats.played++;
  bridgeStats.lastSfx = name;
  if (eventTag) {
    bridgeStats.byReason[eventTag] = (bridgeStats.byReason[eventTag] ?? 0) + 1;
    bridgeStats.lastEvent = eventTag;
  }
  sfx.play(name, { volume });
}

export function installSfxBridge(): () => void {
  // Warm the SFX cache so the first event doesn't pay the parse+render
  // cost on the audio thread.
  sfx.preload();

  const offs: Array<() => void> = [];

  offs.push(
    eventBus.on("SOUND_EMITTED", (p) => {
      bridgeStats.received++;
      const mapping = SOUND_REASON_TO_SFX[p.reason];
      if (!mapping) return;
      fire(mapping.name, mapping.volume, `sound:${p.reason}`);
    }),
  );

  offs.push(
    eventBus.on("LOCKDOWN_TRIGGERED", () => {
      fire("Alarm", 0.7, "LOCKDOWN_TRIGGERED");
    }),
  );

  offs.push(
    eventBus.on("EXCLAMATION_TRIGGERED", () => {
      fire("APEX-19", 0.6, "EXCLAMATION_TRIGGERED");
    }),
  );

  offs.push(
    eventBus.on("COMPLIANCE_CHANGED", (p) => {
      if (p.current === "RED" && p.previous !== "RED") {
        fire("EIRA-7 failure", 0.7, "COMPLIANCE_CHANGED→RED");
      }
    }),
  );

  offs.push(
    eventBus.on("TERMINAL_USED", () => {
      fire("Scan", 0.55, "TERMINAL_USED");
    }),
  );

  offs.push(
    eventBus.on("ITEM_PICKED_UP", () => {
      fire("Light Switch", 0.6, "ITEM_PICKED_UP");
    }),
  );

  offs.push(
    eventBus.on("ITEM_FILED", () => {
      fire("Light Switch", 0.5, "ITEM_FILED");
    }),
  );

  offs.push(
    eventBus.on("PLAYER_PRIED_DOOR", () => {
      fire("knock", 0.7, "PLAYER_PRIED_DOOR");
    }),
  );

  offs.push(
    eventBus.on("ALIGNMENT_SESSION_START", () => {
      fire("VENT-4", 0.5, "ALIGNMENT_SESSION_START");
    }),
  );

  offs.push(
    eventBus.on("PLAYER_VENTED", () => {
      fire("VENT-4", 0.45, "PLAYER_VENTED");
    }),
  );

  // Oxygen tick — Distant Siren on every 5th tick, low volume, so it
  // builds tension without becoming a metronome.
  let oxygenCounter = 0;
  offs.push(
    eventBus.on("OXYGEN_TICK", () => {
      oxygenCounter++;
      if (oxygenCounter % 5 === 0) {
        fire("Distant Siren", 0.35, "OXYGEN_TICK");
      }
    }),
  );

  return () => {
    for (const off of offs) off();
  };
}
