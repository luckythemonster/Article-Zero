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

let player: BeepBoxPlayer | null = null;
let playerPromise: Promise<BeepBoxPlayer | null> | null = null;
const hotEnforcers = new Set<string>();
const stats: MusicStats = {
  loaded: false,
  playing: false,
  lastState: "—",
  lastError: null,
  hotEnforcers: 0,
};

function ensurePlayer(): Promise<BeepBoxPlayer | null> {
  if (player) return Promise.resolve(player);
  if (playerPromise) return playerPromise;
  playerPromise = (async () => {
    try {
      const ctx = getSharedContext();
      if (!ctx) {
        stats.lastError = "no audio context";
        return null;
      }
      const p = await loadAndCreate("/audio/music/chase.json");
      if (!p) {
        stats.lastError = "loadAndCreate returned null";
        return null;
      }
      player = p;
      stats.loaded = true;
      return p;
    } catch (err) {
      stats.lastError = err instanceof Error ? err.message : String(err);
      return null;
    }
  })();
  return playerPromise;
}

function isHot(level: AlertLevel): boolean {
  return level === "ALERT" || level === "EVASION";
}

function updatePlayback(): void {
  stats.hotEnforcers = hotEnforcers.size;
  if (hotEnforcers.size > 0) {
    void ensurePlayer().then((p) => {
      if (!p) return;
      if (!stats.playing) {
        p.play();
        stats.playing = true;
      }
    });
  } else if (player && stats.playing) {
    player.stop();
    stats.playing = false;
  }
}

export function installMusicBridge(): () => void {
  const off = eventBus.on("ENFORCER_ALERT_CHANGED", (p) => {
    stats.lastState = p.to as AlertLevel;
    if (isHot(p.to as AlertLevel)) {
      hotEnforcers.add(p.enforcerId);
    } else {
      hotEnforcers.delete(p.enforcerId);
    }
    updatePlayback();
  });
  return () => {
    off();
    hotEnforcers.clear();
    if (player && stats.playing) {
      player.stop();
      stats.playing = false;
    }
  };
}

export function getMusicStats(): MusicStats {
  return { ...stats };
}

/** Debug-only: force-start / stop the track from the AUDIO panel. */
export async function forcePlay(): Promise<void> {
  const p = await ensurePlayer();
  if (!p) return;
  p.play();
  stats.playing = true;
}

export function forceStop(): void {
  if (!player) return;
  player.stop();
  stats.playing = false;
}
