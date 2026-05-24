// Bridges engine events into actual footstep playback. The engine stays
// audio-unaware: it emits SOUND_EMITTED (player verbs) and ENFORCER_FOOTSTEP
// (enforcer tile-steps); this module resolves surface from the tile underfoot
// and calls `footsteps.play()`. Distance-attenuates enforcer steps so distant
// patrols are quieter than the player's own footfalls.
//
// Each branch of each handler increments a counter so the AUDIO debug panel
// can show exactly where an event drops out: subscription, profile lookup,
// tile lookup, surface lookup, or playback.

import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { roomGraph } from "../engine/RoomGraph";
import { tileSurface } from "../engine/surfaces";
import type { RoomId, Vec2 } from "../types/world.types";
import { footsteps } from "./Footsteps";
import type { FootstepAction } from "./footstep-manifest";

// Reason → (action, volume). Reasons not in this table emit no footstep.
const REASON_PROFILE: Record<string, { action: FootstepAction; volume: number }> = {
  walk:   { action: "walk", volume: 1.0  },
  run:    { action: "run",  volume: 1.0  },
  sneak:  { action: "walk", volume: 0.45 },
  ladder: { action: "walk", volume: 0.85 },
};

interface PlayerStats {
  received: number;
  bailNoProfile: number;
  bailNoTile: number;
  bailNoSurface: number;
  played: number;
  byReason: Record<string, number>;
  last: null | { reason: string; roomId: string; pos: Vec2; surface: string | null };
}

interface EnforcerStats {
  received: number;
  bailRoom: number;
  bailNoTile: number;
  bailNoSurface: number;
  bailZeroVolume: number;
  played: number;
  last: null | { roomId: string; pos: Vec2; dist: number; volume: number };
}

const playerStats: PlayerStats = {
  received: 0,
  bailNoProfile: 0,
  bailNoTile: 0,
  bailNoSurface: 0,
  played: 0,
  byReason: {},
  last: null,
};

const enforcerStats: EnforcerStats = {
  received: 0,
  bailRoom: 0,
  bailNoTile: 0,
  bailNoSurface: 0,
  bailZeroVolume: 0,
  played: 0,
  last: null,
};

export function getBridgeStats(): { player: PlayerStats; enforcer: EnforcerStats } {
  return { player: playerStats, enforcer: enforcerStats };
}

function tileAt(roomId: RoomId, pos: Vec2) {
  if (!worldEngine.hasState()) return null;
  const room = worldEngine.getState().rooms.get(roomId);
  if (!room) return null;
  if (pos.x < 0 || pos.y < 0 || pos.x >= room.width || pos.y >= room.height) return null;
  const tile = room.tiles[pos.y * room.width + pos.x];
  return tile ? { room, tile } : null;
}

function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function installFootstepBridge(): () => void {
  const offs: Array<() => void> = [];

  offs.push(
    eventBus.on("SOUND_EMITTED", (p) => {
      playerStats.received++;
      playerStats.byReason[p.reason] = (playerStats.byReason[p.reason] ?? 0) + 1;
      const profile = REASON_PROFILE[p.reason];
      if (!profile) {
        playerStats.bailNoProfile++;
        playerStats.last = { reason: p.reason, roomId: p.roomId, pos: p.pos, surface: null };
        return;
      }
      const lookup = tileAt(p.roomId, p.pos);
      if (!lookup) {
        playerStats.bailNoTile++;
        playerStats.last = { reason: p.reason, roomId: p.roomId, pos: p.pos, surface: null };
        return;
      }
      const surface = tileSurface(lookup.tile, lookup.room);
      if (!surface) {
        playerStats.bailNoSurface++;
        playerStats.last = { reason: p.reason, roomId: p.roomId, pos: p.pos, surface: null };
        return;
      }
      playerStats.played++;
      playerStats.last = { reason: p.reason, roomId: p.roomId, pos: p.pos, surface };
      footsteps.play({ surface, action: profile.action, volume: profile.volume });
    }),
  );

  offs.push(
    eventBus.on("ENFORCER_FOOTSTEP", (p) => {
      enforcerStats.received++;
      if (!worldEngine.hasState()) {
        enforcerStats.bailRoom++;
        return;
      }
      const state = worldEngine.getState();
      const player = state.player;
      const sameRoom = player.roomId === p.roomId;
      const adjacent =
        !sameRoom &&
        roomGraph
          .openNeighbors(state, player.roomId)
          .some((n) => n.doorway.to === p.roomId);
      if (!sameRoom && !adjacent) {
        enforcerStats.bailRoom++;
        return;
      }
      const lookup = tileAt(p.roomId, p.pos);
      if (!lookup) {
        enforcerStats.bailNoTile++;
        return;
      }
      const surface = tileSurface(lookup.tile, lookup.room);
      if (!surface) {
        enforcerStats.bailNoSurface++;
        return;
      }
      const dist = sameRoom ? manhattan(player.pos, p.pos) : 6;
      const volume = Math.max(0, Math.min(0.6, 1 - dist / 8));
      if (volume <= 0) {
        enforcerStats.bailZeroVolume++;
        return;
      }
      enforcerStats.played++;
      enforcerStats.last = { roomId: p.roomId, pos: p.pos, dist, volume };
      footsteps.play({ surface, action: "walk", volume });
    }),
  );

  return () => {
    for (const off of offs) off();
  };
}
