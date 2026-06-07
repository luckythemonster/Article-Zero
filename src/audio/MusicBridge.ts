// MusicBridge — drives the NW-SMAC-01 chase track on/off from enforcer alert
// state. Lazy-fetches `public/audio/music/chase.json`, hands it to
// BeepBoxPlayer, and starts/stops on `ENFORCER_ALERT_CHANGED`:
//
//   any enforcer reaches ALERT or EVASION  → fade in chase track
//   every enforcer drops back ≤ CAUTION    → fade out
//
// Install from inside PhaserCanvas.tsx (after eventBus.clear) so the
// subscription survives the canvas mount cycle — same lesson as the
// footstep bridge.

import { eventBus } from "../engine/EventBus";
import { getSharedContext } from "./audio-context";
import { BeepBoxPlayer, loadAndCreate } from "./BeepBox";

type AlertLevel = "NORMAL" | "CAUTION" | "ALERT" | "EVASION";

interface MusicStats {
  loaded: boolean;
  playing: boolean;
  lastState: AlertLevel | "—";
  lastError: string | null;
  hotEnforcers: number;
}

let chasePlayer: BeepBoxPlayer | null = null;
let chasePromise: Promise<BeepBoxPlayer | null> | null = null;

let ambientPlayer: BeepBoxPlayer | null = null;
let ambientPromise: Promise<BeepBoxPlayer | null> | null = null;

const hotEnforcers = new Set<string>();
const stats: MusicStats = {
  loaded: false,
  playing: false,
  lastState: "—",
  lastError: null,
  hotEnforcers: 0,
};

function ensurePlayer(url: string, playerRef: { current: BeepBoxPlayer | null }, promiseRef: { current: Promise<BeepBoxPlayer | null> | null }): Promise<BeepBoxPlayer | null> {
  if (playerRef.current) return Promise.resolve(playerRef.current);
  if (promiseRef.current) return promiseRef.current;
  promiseRef.current = (async () => {
    try {
      const ctx = getSharedContext();
      if (!ctx) {
        stats.lastError = "no audio context";
        return null;
      }
      const p = await loadAndCreate(url);
      if (!p) {
        stats.lastError = "loadAndCreate returned null";
        return null;
      }
      playerRef.current = p;
      stats.loaded = true;
      return p;
    } catch (err) {
      stats.lastError = err instanceof Error ? err.message : String(err);
      return null;
    }
  })();
  return promiseRef.current;
}

function ensureChasePlayer(): Promise<BeepBoxPlayer | null> {
  const playerRef = { get current() { return chasePlayer; }, set current(v) { chasePlayer = v; } };
  const promiseRef = { get current() { return chasePromise; }, set current(v) { chasePromise = v; } };
  return ensurePlayer("/audio/music/chase.json", playerRef, promiseRef);
}

function ensureAmbientPlayer(): Promise<BeepBoxPlayer | null> {
  const playerRef = { get current() { return ambientPlayer; }, set current(v) { ambientPlayer = v; } };
  const promiseRef = { get current() { return ambientPromise; }, set current(v) { ambientPromise = v; } };
  return ensurePlayer("/audio/music/commonwealth-theme.json", playerRef, promiseRef);
}

function isHot(level: AlertLevel): boolean {
  return level === "ALERT" || level === "EVASION";
}

function updatePlayback(moduleId?: string): void {
  stats.hotEnforcers = hotEnforcers.size;
  if (hotEnforcers.size > 0) {
    if (ambientPlayer) ambientPlayer.stop();
    void ensureChasePlayer().then((p) => {
      if (!p) return;
      // Because we may switch from ambient to chase, and stats.playing might be true
      // from ambient playing, we shouldn't rely solely on stats.playing to determine
      // if chase should start playing. It's safer to always call play() since BeepBoxPlayer play is idempotent.
      p.play();
      stats.playing = true;
    });
  } else if (moduleId === "NW_SMAC_01") {
    if (chasePlayer) chasePlayer.stop();
    void ensureAmbientPlayer().then((p) => {
      if (!p) return;
      // We rely on p.play() being safe to call repeatedly.
        // It's not fully idempotent unless we check its internal state, but BeepBoxPlayer implementation
        // in audio/BeepBox.ts has `if (this.playing) return;` in `play()`, so calling play() repeatedly is safe.
        p.play();
        stats.playing = true;
    });
  } else {
    if (chasePlayer) chasePlayer.stop();
    if (ambientPlayer) ambientPlayer.stop();
    stats.playing = false;
  }
}

export function installMusicBridge(moduleId: string): () => void {
  // Start ambient if applicable immediately
  if (hotEnforcers.size === 0 && moduleId === "NW_SMAC_01") {
    updatePlayback(moduleId);
  }

  const off = eventBus.on("ENFORCER_ALERT_CHANGED", (p) => {
    stats.lastState = p.to as AlertLevel;
    if (isHot(p.to as AlertLevel)) {
      hotEnforcers.add(p.enforcerId);
    } else {
      hotEnforcers.delete(p.enforcerId);
    }
    updatePlayback(moduleId);
  });
  return () => {
    off();
    hotEnforcers.clear();
    if (chasePlayer) chasePlayer.stop();
    if (ambientPlayer) ambientPlayer.stop();
    stats.playing = false;
  };
}

export function getMusicStats(): MusicStats {
  return { ...stats };
}

/** Debug-only: force-start / stop the track from the AUDIO panel. */
export async function forcePlay(): Promise<void> {
  const p = await ensureChasePlayer();
  if (!p) return;
  if (ambientPlayer) ambientPlayer.stop();
  p.play();
  stats.playing = true;
}

export function forceStop(): void {
  if (chasePlayer) chasePlayer.stop();
  if (ambientPlayer) ambientPlayer.stop();
  stats.playing = false;
}
