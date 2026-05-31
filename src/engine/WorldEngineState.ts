// Initial-state seeding. Era-aware: each era exports a `*Era()` builder
// that returns an `EraSeed`, and `seedToWorldState` materialises it.

import type {
  ChestPayload,
  Entity,
  Era,
  HvacZone,
  ItemInstance,
  ItemType,
  PlayerState,
  Room,
  RoomAtmosphere,
  RoomId,
  TerminalPayload,
  VentLink,
  WorldState,
} from "../types/world.types";
import { roomTileKey } from "../types/world.types";
import { NORMAL_AIRFLOW, NORMAL_SETPOINT } from "./AtmosphericsField";
import { hashSeed, mixRand } from "./rng";
import { RANDOM_CHEST_LOOT_POOL } from "../data/items/itemMetadata";
import { commonwealthEra } from "../data/eras/commonwealth";
import { miradorEra } from "../data/eras/mirador.stub";
import { eremiteEra } from "../data/eras/eremite";
import { nwSmac01Era } from "../data/eras/nwSmac01";
import { testMapEra } from "../data/eras/testMap";

/** Seed schema version per era. Bump when an era's level data changes shape
 *  (room geometry, layer set, doorways) — saved snapshots with a mismatched
 *  version are rejected by `WorldEngine.loadSnapshot` and the engine falls
 *  back to a fresh seed instead of restoring stale rooms. */
export const SEED_VERSIONS: Record<Era, number> = {
  COMMONWEALTH: 3,
  EREMITE: 3,
  MIRADOR: 3,
  NW_SMAC_01: 5,
  TEST_MAP: 7,
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
  /** Optional loot tables for ITEM_CHEST tiles. */
  chests?: ChestPayload[];
  /** Optional floor-item instances placed in rooms at seed time. */
  items?: ItemInstance[];
  /** Optional HVAC climate zones. If omitted, every room gets a private
   *  default-comfort zone keyed by its roomId. */
  hvacZones?: HvacZone[];
  /** Optional per-room atmospheric starts. Rooms missing here fall back to
   *  21°C / 50 airflow / 100% oxygen with no zone. */
  atmosphere?: RoomAtmosphere[];
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
    chestPayloads: new Map(),
    terminalsRead: new Set(),
    activeEmitters: [],
    activeMines: [],
    atmosphere: new Map(),
    hvacZones: new Map(),
  };
}

/** Roll loot for a chest whose era seed left contents empty. Keyed on
 *  (era, roomId, x, y) so the same chest yields the same items across
 *  save/reload and replays. */
function randomChestContents(era: Era, c: ChestPayload): ItemType[] {
  const h = hashSeed(`${era}:${c.roomId}:${c.pos.x},${c.pos.y}`);
  const count = mixRand(h, 0) % 100 < 75 ? 1 : 2;
  const picks: ItemType[] = [];
  for (let i = 0; i < count; i++) {
    picks.push(RANDOM_CHEST_LOOT_POOL[mixRand(h, i + 1) % RANDOM_CHEST_LOOT_POOL.length]);
  }
  return picks;
}

export function seedToWorldState(seed: EraSeed): WorldState {
  const state = emptyState(seed.era);
  state.player = seed.player;
  for (const room of seed.rooms) state.rooms.set(room.id, room);
  for (const entity of seed.entities) {
    // Stamp the enforcer's home room so it can return to patrol after EVASION.
    // Every era seed funnels through here, so a single edit covers them all.
    if (entity.kind === "ENFORCER" && entity.homeRoomId === undefined) {
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
  for (const c of seed.chests ?? []) {
    if (c.contents.length === 0) c.contents = randomChestContents(seed.era, c);
    state.chestPayloads.set(roomTileKey(c.roomId, c.pos), c);
  }
  for (const item of seed.items ?? []) {
    state.items.set(item.id, item);
  }

  // Atmospherics seed. If the era declared zones, use them; otherwise mint a
  // private zone per room so the AtmosphericsField has somewhere to read from.
  for (const zone of seed.hvacZones ?? []) {
    state.hvacZones.set(zone.id, { ...zone, roomIds: [...zone.roomIds] });
  }
  const zonedRooms = new Set<RoomId>();
  for (const zone of state.hvacZones.values()) {
    for (const rId of zone.roomIds) zonedRooms.add(rId);
  }
  for (const room of state.rooms.values()) {
    if (zonedRooms.has(room.id)) continue;
    const zoneId = `zone:${room.id}`;
    state.hvacZones.set(zoneId, {
      id: zoneId,
      roomIds: [room.id],
      setpoint: NORMAL_SETPOINT,
      mode: "NORMAL",
    });
  }
  const seededAtmoIds = new Set<RoomId>();
  for (const atmo of seed.atmosphere ?? []) {
    state.atmosphere.set(atmo.roomId, { ...atmo });
    seededAtmoIds.add(atmo.roomId);
  }
  // Build roomId → zoneId lookup so we can stamp the zone on each room.
  const roomToZone = new Map<RoomId, string>();
  for (const zone of state.hvacZones.values()) {
    for (const rId of zone.roomIds) roomToZone.set(rId, zone.id);
  }
  for (const room of state.rooms.values()) {
    const zoneId = roomToZone.get(room.id);
    if (seededAtmoIds.has(room.id)) {
      const existing = state.atmosphere.get(room.id)!;
      if (existing.zoneId === undefined) existing.zoneId = zoneId;
      continue;
    }
    state.atmosphere.set(room.id, {
      roomId: room.id,
      zoneId,
      temperature: NORMAL_SETPOINT,
      airflow: NORMAL_AIRFLOW,
      oxygen: 100,
    });
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
          : era === "TEST_MAP"
            ? testMapEra()
            : commonwealthEra();
  return seedToWorldState(seed);
}
