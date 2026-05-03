// SaveSystem — slot-based persistence to LocalStorage. Schema-versioned so we
// can migrate as the game grows. Stores the full WorldState (Maps reduced to
// arrays), the document archive, and the Article Zero meta-file.

import type { WorldState } from "../types/world.types";
import { worldEngine } from "./WorldEngine";
import { documentArchive } from "./DocumentArchive";
import { articleZeroMeta } from "./ArticleZeroMeta";
import { eventBus } from "./EventBus";

const SCHEMA_VERSION = 1;
const KEY_PREFIX = "articlezero.slot.";

export interface SaveBlob {
  version: number;
  savedAt: number;
  era: WorldState["era"];
  turn: number;
  state: any;
  archive: any;
  meta: any;
}

function serialiseState(s: WorldState): any {
  return {
    era: s.era,
    turn: s.turn,
    redDay: s.redDay,
    player: s.player,
    floors: Array.from(s.floors.entries()),
    entities: Array.from(s.entities.entries()),
    items: Array.from(s.items.entries()),
    visibleTiles: Array.from(s.visibleTiles),
    memoryTrace: Array.from(s.memoryTrace),
    detected: s.detected,
    detained: s.detained,
    substrateResonance: s.substrateResonance,
    violations: s.violations,
    alignmentLightActive: s.alignmentLightActive,
  };
}

function deserialiseState(s: any): WorldState {
  return {
    era: s.era,
    turn: s.turn,
    redDay: s.redDay,
    player: s.player,
    floors: new Map(s.floors),
    entities: new Map(s.entities),
    items: new Map(s.items),
    visibleTiles: new Set(s.visibleTiles),
    memoryTrace: new Set(s.memoryTrace ?? []),
    detected: s.detected,
    detained: s.detained,
    substrateResonance: s.substrateResonance,
    violations: s.violations,
    alignmentLightActive: s.alignmentLightActive ?? false,
  };
}

function migrate(blob: SaveBlob): SaveBlob {
  // Future schema migrations live here. v1 is the only version today.
  return blob;
}

class SaveSystem {
  hasSlot(slot: number): boolean {
    return localStorage.getItem(KEY_PREFIX + slot) !== null;
  }

  describeSlot(slot: number): { era: string; turn: number; savedAt: number } | null {
    const raw = localStorage.getItem(KEY_PREFIX + slot);
    if (!raw) return null;
    try {
      const blob = JSON.parse(raw) as SaveBlob;
      return { era: blob.era, turn: blob.turn, savedAt: blob.savedAt };
    } catch {
      return null;
    }
  }

  save(slot: number): void {
    const s = worldEngine.getState();
    const blob: SaveBlob = {
      version: SCHEMA_VERSION,
      savedAt: Date.now(),
      era: s.era,
      turn: s.turn,
      state: serialiseState(s),
      archive: documentArchive.toJSON(),
      meta: articleZeroMeta.toJSON(),
    };
    // Sets serialise as objects in JSON; coerce manually.
    blob.meta.fragmentsFound = Array.from(blob.meta.fragmentsFound);
    localStorage.setItem(KEY_PREFIX + slot, JSON.stringify(blob));
    eventBus.emit("SAVE_WRITTEN", { slot, era: s.era, turn: s.turn });
  }

  load(slot: number): boolean {
    const raw = localStorage.getItem(KEY_PREFIX + slot);
    if (!raw) return false;
    let blob = JSON.parse(raw) as SaveBlob;
    blob = migrate(blob);
    const state = deserialiseState(blob.state);
    worldEngine.loadFromState(state);
    documentArchive.fromJSON(blob.archive);
    articleZeroMeta.fromJSON(blob.meta);
    worldEngine.recomputeFOV();
    eventBus.emit("SAVE_LOADED", { slot, era: blob.era, turn: blob.turn });
    return true;
  }

  delete(slot: number): void {
    localStorage.removeItem(KEY_PREFIX + slot);
  }
}

export const saveSystem = new SaveSystem();
