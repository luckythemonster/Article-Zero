// Bridges engine events into actual footstep playback. The engine stays
// audio-unaware: it emits SOUND_EMITTED (player verbs) and GUARD_FOOTSTEP
// (guard tile-steps); this module resolves surface from the tile underfoot
// and calls `footsteps.play()`. Distance-attenuates guard steps so distant
// patrols are quieter than the player's own footfalls.

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
      const profile = REASON_PROFILE[p.reason];
      if (!profile) return;
      const lookup = tileAt(p.roomId, p.pos);
      if (!lookup) return;
      const surface = tileSurface(lookup.tile, lookup.room);
      if (!surface) return;
      footsteps.play({ surface, action: profile.action, volume: profile.volume });
    }),
  );

  offs.push(
    eventBus.on("GUARD_FOOTSTEP", (p) => {
      if (!worldEngine.hasState()) return;
      const state = worldEngine.getState();
      const player = state.player;
      const sameRoom = player.roomId === p.roomId;
      const adjacent =
        !sameRoom &&
        roomGraph
          .openNeighbors(state, player.roomId)
          .some((n) => n.doorway.to === p.roomId);
      if (!sameRoom && !adjacent) return;
      const lookup = tileAt(p.roomId, p.pos);
      if (!lookup) return;
      const surface = tileSurface(lookup.tile, lookup.room);
      if (!surface) return;
      const dist = sameRoom ? manhattan(player.pos, p.pos) : 6;
      const volume = Math.max(0, Math.min(0.6, 1 - dist / 8));
      if (volume <= 0) return;
      footsteps.play({ surface, action: "walk", volume });
    }),
  );

  return () => {
    for (const off of offs) off();
  };
}
