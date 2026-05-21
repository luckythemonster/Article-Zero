// Initial-state seeding. Era-aware: each era exports a `*Era()` builder
// that returns an `EraSeed`, and `seedToWorldState` materialises it.

import type {
  Entity,
  Era,
  ItemInstance,
  PlayerState,
  Room,
  RoomId,
  TerminalPayload,
  VentLink,
  WorldState,
} from "../types/world.types";
import { roomTileKey } from "../types/world.types";
import { commonwealthEra } from "../data/eras/commonwealth";
import { miradorEra } from "../data/eras/mirador.stub";
import { eremiteEra } from "../data/eras/eremite";
import { nwSmac01Era } from "../data/eras/nwSmac01";

/** Seed schema version per era. Bump when an era's level data changes shape
 *  (room geometry, layer set, doorways) — saved snapshots with a mismatched
 *  version are rejected by `WorldEngine.loadSnapshot` and the engine falls
 *  back to a fresh seed instead of restoring stale rooms. */
export const SEED_VERSIONS: Record<Era, number> = {
  COMMONWEALTH: 3,
  EREMITE: 3,
  MIRADOR: 3,
  NW_SMAC_01: 5,
};

export interface EraSeed {
  era: Era;
  player: PlayerState;
  rooms: Room[];
  /** Initial room the player spawns into. Must match `player.roomId`. */
  startRoomId: RoomId;
  entities: Entity[];
  /** Optional vent-crawl links between VENT tiles. */
  ventLinks?: VentLink[];
  /** Optional payload table for TERMINAL tiles. */
  terminals?: TerminalPayload[];
  /** Optional floor-item instances placed in rooms at seed time. */
  items?: ItemInstance[];
}

export function emptyState(era: Era): WorldState {
  return {
    era,
    turn: 1,
    player: {
      roomId: "",
      pos: { x: 0, y: 0 },
      z: 0,
      facing: "south",
      ap: 4,
      apMax: 4,
      flashlightOn: false,
      flashlightBattery: 30,
      stance: "WALK",
      name: "TECH-2 ROWAN-IBARRA",
      qScore: 0,
      inventory: [],
      compliance: "GREEN",
    },
    rooms: new Map(),
    entities: new Map(),
    items: new Map(),
    visibleTiles: new Set(),
    alignmentLightActive: false,
    detected: false,
    detained: false,
    ventLinks: new Map(),
    terminalPayloads: new Map(),
    terminalsRead: new Set(),
    activeEmitters: [],
  };
}

export function seedToWorldState(seed: EraSeed): WorldState {
  const state = emptyState(seed.era);
  state.player = seed.player;
  for (const room of seed.rooms) state.rooms.set(room.id, room);
  for (const entity of seed.entities) {
    // Stamp the guard's home room so it can return to patrol after EVASION.
    // Every era seed funnels through here, so a single edit covers them all.
    if (entity.kind === "GUARD" && entity.homeRoomId === undefined) {
      entity.homeRoomId = entity.roomId;
    }
    state.entities.set(entity.id, entity);
  }
  for (const link of seed.ventLinks ?? []) {
    state.ventLinks.set(roomTileKey(link.a.roomId, link.a.pos), link.b);
    state.ventLinks.set(roomTileKey(link.b.roomId, link.b.pos), link.a);
  }
  for (const t of seed.terminals ?? []) {
    state.terminalPayloads.set(roomTileKey(t.roomId, t.pos), t);
  }
  for (const item of seed.items ?? []) {
    state.items.set(item.id, item);
  }
  return state;
}

export function seedFromEra(era: Era): WorldState {
  const seed =
    era === "EREMITE"
      ? eremiteEra()
      : era === "MIRADOR"
        ? miradorEra()
        : era === "NW_SMAC_01"
          ? nwSmac01Era()
          : commonwealthEra();
  return seedToWorldState(seed);
}
