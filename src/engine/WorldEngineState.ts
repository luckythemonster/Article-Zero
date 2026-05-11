// Initial-state seeding. Era-aware: each era exports a `*Era()` builder
// that returns an `EraSeed`, and `seedToWorldState` materialises it.

import type {
  Entity,
  Era,
  PlayerState,
  Room,
  RoomId,
  WorldState,
} from "../types/world.types";
import { commonwealthEra } from "../data/eras/commonwealth";
import { latticeEra } from "../data/eras/lattice";
import { baffleEra } from "../data/eras/baffle.stub";
import { miradorEra } from "../data/eras/mirador.stub";
import { arc1Era } from "../data/eras/arc1";

export interface EraSeed {
  era: Era;
  player: PlayerState;
  rooms: Room[];
  /** Initial room the player spawns into. Must match `player.roomId`. */
  startRoomId: RoomId;
  entities: Entity[];
}

export function emptyState(era: Era): WorldState {
  return {
    era,
    turn: 1,
    player: {
      roomId: "",
      pos: { x: 0, y: 0 },
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
  };
}

export function seedToWorldState(seed: EraSeed): WorldState {
  const state = emptyState(seed.era);
  state.player = seed.player;
  for (const room of seed.rooms) state.rooms.set(room.id, room);
  for (const entity of seed.entities) state.entities.set(entity.id, entity);
  return state;
}

export function seedFromEra(era: Era): WorldState {
  const seed = era === "COMMONWEALTH"
    ? commonwealthEra()
    : era === "LATTICE"
      ? latticeEra()
      : era === "BAFFLE"
        ? baffleEra()
        : era === "ARC1"
          ? arc1Era()
          : miradorEra();
  return seedToWorldState(seed);
}
