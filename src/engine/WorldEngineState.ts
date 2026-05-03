// Initial state seeding. Era-aware: Commonwealth ships as the playable slice;
// Lattice ships as Sol's Ring C / pre-Bright-Knot shift; Baffle is a small
// stub for The Finder; Mirador is preserved as a hidden dev branch.

import type {
  Entity,
  Era,
  Floor,
  PlayerState,
  SRP,
  WorldState,
} from "../types/world.types";
import { commonwealthEra } from "../data/eras/commonwealth";
import { latticeStub } from "../data/eras/lattice";
import { baffleStub } from "../data/eras/baffle.stub";
import { miradorStub } from "../data/eras/mirador.stub";

export interface EraSeed {
  era: Era;
  player: PlayerState;
  floors: Floor[];
  entities: Entity[];
  startingItems: WorldState["items"] extends Map<string, infer V> ? V[] : never;
}

export const Q0_SRP: SRP = {
  Q: 0,
  M: 0,
  C: 0,
  R: 0,
  B: 0,
  S: 0,
  L: 0,
  E: 0,
  Y: 0,
  H: 0,
};

export function emptyState(era: Era): WorldState {
  return {
    era,
    turn: 1,
    redDay: false,
    player: {
      pos: { x: 0, y: 0, z: 0 },
      facing: "south",
      ap: 4,
      apMax: 4,
      condition: 10,
      conditionMax: 10,
      compliance: "GREEN",
      belief: "NONE",
      inventory: [],
      flashlightOn: false,
      flashlightBattery: 30,
      name: "TECH-2 ROWAN-IBARRA",
    },
    floors: new Map(),
    entities: new Map(),
    items: new Map(),
    visibleTiles: new Set(),
    memoryTrace: new Set(),
    detected: false,
    detained: false,
    substrateResonance: 0,
    violations: [],
    alignmentLightActive: false,
  };
}

/** Build a fresh WorldState from any EraSeed (era-keyed or hand-rolled). */
export function seedToWorldState(seed: EraSeed): WorldState {
  const state = emptyState(seed.era);
  state.player = seed.player;
  for (const floor of seed.floors) state.floors.set(floor.z, floor);
  for (const entity of seed.entities) state.entities.set(entity.id, entity);
  for (const item of seed.startingItems) state.items.set(item.id, item);
  return state;
}

export function seedFromEra(era: Era): WorldState {
  const seed = era === "COMMONWEALTH"
    ? commonwealthEra()
    : era === "LATTICE"
      ? latticeStub()
      : era === "BAFFLE"
        ? baffleStub()
        : miradorStub();
  return seedToWorldState(seed);
}
