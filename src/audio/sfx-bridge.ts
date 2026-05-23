// Bridges typed engine events into the SFX player. Three paths:
//
//   1. SOUND_EMITTED with a reason the footstep bridge doesn't handle
//      (door, locker, light_toggle, knock, pry-lockdown). The footstep
//      bridge silently drops these; we pick them up here and play the
//      matching jsfxr sound.
//
//   2. Direct game events (LOCKDOWN_TRIGGERED, EXCLAMATION_TRIGGERED,
//      etc.) that have no SoundField intent but warrant a UI/foreground
//      cue. Mix of jsfxr one-shots and Glitch Noises wavs.
//
//   3. Long-running events (EXTRACTION_STARTED/COMPLETED/INTERRUPTED)
//      that drive looping wav clips with start+stop pairing. Loop
//      handles are stored in a Map keyed by terminalId so we can stop
//      the matching scrubbing + ambient layers on completion.
//
// Install from PhaserCanvas.tsx alongside the footstep + music bridges
// so the subscription survives the eventBus.clear() on canvas remount.

import { eventBus } from "../engine/EventBus";
import { sfx, type LoopHandle } from "./Sfx";

const SOUND_REASON_TO_SFX: Record<string, { name: string; volume?: number }> = {
  door:           { name: "knock",        volume: 0.55 },
  locker:         { name: "knock",        volume: 0.35 },
  light_toggle:   { name: "light switch", volume: 0.7  },
  knock:          { name: "knock",        volume: 0.85 },
  "pry-lockdown": { name: "EMP",          volume: 0.6  },
  emp:            { name: "EMP",          volume: 0.7  },
};

interface BridgeStats {
  received: number;
  played: number;
  byReason: Record<string, number>;
  lastEvent: string | null;
  lastSfx: string | null;
  activeLoops: number;
}

const bridgeStats: BridgeStats = {
  received: 0,
  played: 0,
  byReason: {},
  lastEvent: null,
  lastSfx: null,
  activeLoops: 0,
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

function fireOneShot(name: string, volume?: number, eventTag?: string): void {
  // Like fire(), but explicitly forces loop:false so a normally-looped
  // clip (data.screeching, alarm.biohazard, comm.interference-tone)
  // plays through its file length once and stops naturally.
  bridgeStats.played++;
  bridgeStats.lastSfx = name;
  if (eventTag) {
    bridgeStats.byReason[eventTag] = (bridgeStats.byReason[eventTag] ?? 0) + 1;
    bridgeStats.lastEvent = eventTag;
  }
  sfx.play(name, { volume, loop: false });
}

function startLoop(name: string, volume?: number): LoopHandle | null {
  const handle = sfx.play(name, { volume, loop: true });
  if (handle) bridgeStats.activeLoops++;
  return handle;
}

function stopLoop(handle: LoopHandle | null): void {
  if (!handle) return;
  handle.stop();
  bridgeStats.activeLoops = Math.max(0, bridgeStats.activeLoops - 1);
}

interface ExtractionLoops {
  scrubbing: LoopHandle | null;
  ambient: LoopHandle | null;
}
const extractionLoops = new Map<string, ExtractionLoops>();

function stopExtraction(terminalId: string): void {
  const loops = extractionLoops.get(terminalId);
  if (!loops) return;
  stopLoop(loops.scrubbing);
  stopLoop(loops.ambient);
  extractionLoops.delete(terminalId);
}

export function installSfxBridge(): () => void {
  // Warm the SFX cache so the first event doesn't pay the parse+render
  // cost on the audio thread. Also kicks off the wav index fetch.
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
      // Replace jsfxr Alarm with the Glitch biohazard loop, fired as a
      // one-shot (clip plays through ~5s and stops). No LOCKDOWN_ENDED
      // event exists yet, so we can't tie a true loop to its lifetime.
      // Layer the doom siren jsfxr on top for an extra alarm bite.
      fireOneShot("alarm.biohazard", 0.55, "LOCKDOWN_TRIGGERED");
      fire("doom siren", 0.5, "LOCKDOWN_TRIGGERED");
    }),
  );

  offs.push(
    eventBus.on("AUDIT_LOCKDOWN_TRIGGERED", () => {
      fireOneShot("alarm.decontamination", 0.55, "AUDIT_LOCKDOWN_TRIGGERED");
    }),
  );

  offs.push(
    eventBus.on("PLAYER_DETECTED", () => {
      fire("alarm.incoming", 0.6, "PLAYER_DETECTED");
    }),
  );

  offs.push(
    eventBus.on("EXCLAMATION_TRIGGERED", () => {
      // Layer: keep the jsfxr APEX-19 punch, add a glitch.distortion
      // stinger underneath for digital bite.
      fire("APEX-19", 0.6, "EXCLAMATION_TRIGGERED");
      fire("glitch.distortion", 0.5, "EXCLAMATION_TRIGGERED");
    }),
  );

  offs.push(
    eventBus.on("COMPLIANCE_CHANGED", (p) => {
      if (p.current === "RED" && p.previous !== "RED") {
        fire("EIRA-7 failure", 0.7, "COMPLIANCE_CHANGED→RED");
        fire("rise.kernel-panic", 0.6, "COMPLIANCE_CHANGED→RED");
      }
    }),
  );

  offs.push(
    eventBus.on("TERMINAL_USED", () => {
      // Layer: jsfxr Scan stays for short-feedback click, data.reading
      // plays through once for digital character.
      fire("Scan", 0.55, "TERMINAL_USED");
      fireOneShot("data.reading", 0.35, "TERMINAL_USED");
    }),
  );

  offs.push(
    eventBus.on("ITEM_PICKED_UP", () => {
      fire("Light Switch", 0.6, "ITEM_PICKED_UP");
      fire("ui.processing-complete", 0.5, "ITEM_PICKED_UP");
    }),
  );

  offs.push(
    eventBus.on("ITEM_FILED", () => {
      fire("Light Switch", 0.5, "ITEM_FILED");
      fire("ui.select", 0.5, "ITEM_FILED");
    }),
  );

  offs.push(
    eventBus.on("PLAYER_PRIED_DOOR", () => {
      fire("knock", 0.7, "PLAYER_PRIED_DOOR");
      fire("rise.confirm-deletion", 0.45, "PLAYER_PRIED_DOOR");
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

  offs.push(
    eventBus.on("DIALOGUE_OPENED", () => {
      fire("comm.intercom-in", 0.65, "DIALOGUE_OPENED");
    }),
  );

  offs.push(
    eventBus.on("DIALOGUE_CLOSED", () => {
      fire("comm.intercom-out", 0.65, "DIALOGUE_CLOSED");
    }),
  );

  offs.push(
    eventBus.on("FLASHLIGHT_TOGGLED", (p) => {
      if (p.on) fire("flashlight on", 0.5, "FLASHLIGHT_TOGGLED:on");
      else if (p.battery === 0)
        fire("flashlight batteries dead", 0.6, "FLASHLIGHT_TOGGLED:dead");
      else fire("glitch.bit", 0.5, "FLASHLIGHT_TOGGLED:off");
    }),
  );

  // Oxygen tick — Glitch interference tone on every 5th tick, low
  // volume, fired as a one-shot through its full clip length.
  let oxygenCounter = 0;
  offs.push(
    eventBus.on("OXYGEN_TICK", () => {
      oxygenCounter++;
      if (oxygenCounter % 5 === 0) {
        fireOneShot("comm.interference-tone", 0.25, "OXYGEN_TICK");
      }
    }),
  );

  // Extraction lifecycle: start a scrubbing loop + decryption-server
  // ambient on STARTED, stop both on COMPLETED/INTERRUPTED, layer a
  // confirmation or screeching+cancel sting on top.
  offs.push(
    eventBus.on("EXTRACTION_STARTED", (p) => {
      stopExtraction(p.terminalId);
      const scrubbing = startLoop("data.scrubbing", 0.5);
      const ambient = startLoop("ambient.decryption-server", 0.35);
      extractionLoops.set(p.terminalId, { scrubbing, ambient });
      bridgeStats.byReason["EXTRACTION_STARTED"] =
        (bridgeStats.byReason["EXTRACTION_STARTED"] ?? 0) + 1;
      bridgeStats.lastEvent = "EXTRACTION_STARTED";
    }),
  );

  offs.push(
    eventBus.on("EXTRACTION_COMPLETED", (p) => {
      stopExtraction(p.terminalId);
      fire("ui.processing-complete", 0.6, "EXTRACTION_COMPLETED");
      fire("ui.select", 0.5, "EXTRACTION_COMPLETED");
    }),
  );

  offs.push(
    eventBus.on("EXTRACTION_INTERRUPTED", (p) => {
      stopExtraction(p.terminalId);
      fireOneShot("data.screeching", 0.45, "EXTRACTION_INTERRUPTED");
      fire("ui.cancel", 0.6, "EXTRACTION_INTERRUPTED");
    }),
  );

  return () => {
    // Stop every active extraction loop before tearing down the
    // subscriptions so a canvas remount doesn't leak BufferSources.
    for (const id of [...extractionLoops.keys()]) stopExtraction(id);
    for (const off of offs) off();
  };
}
