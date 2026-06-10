// Map/Set ↔ JSON-safe round-trip for sim snapshots.

import type { Room } from "../types/world.types";
import type {
  PhysicalState,
  SerializedPhysical,
  SerializedSubjective,
  SubjectiveState,
} from "./sim.types";

export function serializePhysical(p: PhysicalState): SerializedPhysical {
  // The `litTiles` cache is a transient Set computed lazily by LightField; it
  // doesn't JSON-stringify and would corrupt the cache on rehydrate. Strip
  // it. `bleedLights` is also runtime-derived (recomputed by WorldEngine
  // after every toggle and at load time), so strip that too.
  const sanitisedRooms: [string, Room][] = Array.from(p.rooms.entries()).map(
    ([id, r]) => [id, { ...r, litTiles: undefined, bleedLights: undefined }],
  );
  return {
    era: p.era,
    turn: p.turn,
    rooms: sanitisedRooms,
    ventLinks: Array.from(p.ventLinks.entries()),
    terminalPayloads: Array.from(p.terminalPayloads.entries()),
    chestPayloads: Array.from(p.chestPayloads.entries()),
    playerRoomId: p.playerRoomId,
    playerPos: p.playerPos,
    playerZ: p.playerZ,
    playerFacing: p.playerFacing,
    entityPositions: Array.from(p.entityPositions.entries()),
    entityKinds: Array.from(p.entityKinds.entries()),
    atmosphere: p.atmosphere ? Array.from(p.atmosphere.entries()) : undefined,
    hvacZones: p.hvacZones ? Array.from(p.hvacZones.entries()) : undefined,
  };
}

export function deserializePhysical(s: SerializedPhysical): PhysicalState {
  const rooms = new Map(s.rooms);
  // Migration: older snapshots predate Tile.elevation. Default-fill so the
  // physics layer doesn't trip over NaN when reading a saved room.
  for (const room of rooms.values()) {
    for (const tile of room.tiles) {
      if (typeof tile.elevation !== "number") tile.elevation = 0;
    }
  }
  // Migration: older entity snapshots predate Entity.z. Default to 0.
  const entityPositions = new Map(s.entityPositions);
  for (const [, phys] of entityPositions) {
    if (typeof phys.z !== "number") phys.z = 0;
  }
  return {
    era: s.era,
    turn: s.turn,
    rooms,
    ventLinks: new Map(s.ventLinks),
    terminalPayloads: new Map(s.terminalPayloads),
    chestPayloads: new Map(s.chestPayloads ?? []),
    playerRoomId: s.playerRoomId,
    playerPos: s.playerPos,
    playerZ: s.playerZ ?? 0,
    playerFacing: s.playerFacing,
    entityPositions,
    entityKinds: new Map(s.entityKinds),
    atmosphere: s.atmosphere ? new Map(s.atmosphere) : new Map(),
    hvacZones: s.hvacZones ? new Map(s.hvacZones) : new Map(),
  };
}

export function serializeSubjective(s: SubjectiveState): SerializedSubjective {
  return {
    qScore: s.qScore,
    compliance: s.compliance,
    inventory: s.inventory,
    objectives: s.objectives,
    ap: s.ap,
    apMax: s.apMax,
    stance: s.stance,
    flashlightOn: s.flashlightOn,
    flashlightBattery: s.flashlightBattery,
    name: s.name,
    peeking: s.peeking,
    hidingTileKey: s.hidingTileKey,
    spoofTurnsRemaining: s.spoofTurnsRemaining,
    lastMoveTurn: s.lastMoveTurn,
    entityMinds: Array.from(s.entityMinds.entries()),
    visibleTiles: Array.from(s.visibleTiles),
    alignmentLightActive: s.alignmentLightActive,
    detected: s.detected,
    detained: s.detained,
    terminalsRead: Array.from(s.terminalsRead),
    worldItems: Array.from(s.worldItems.entries()),
    documentCases: Array.from(s.documentCases.entries()),
    activeEmitters: s.activeEmitters.map((e) => ({ ...e })),
    activeMines: s.activeMines.map((m) => ({ ...m })),
  };
}

export function deserializeSubjective(s: SerializedSubjective): SubjectiveState {
  // Legacy stance migration: pre-realtime saves carry "CREEP"; the union has
  // since been renamed to "SNEAK" with identical semantics. Coerce silently.
  const stance =
    (s.stance as unknown as string) === "CREEP"
      ? ("SNEAK" as typeof s.stance)
      : s.stance;
  return {
    qScore: s.qScore,
    compliance: s.compliance,
    inventory: s.inventory,
    objectives: s.objectives ?? [],
    ap: s.ap,
    apMax: s.apMax,
    stance,
    flashlightOn: s.flashlightOn,
    flashlightBattery: s.flashlightBattery,
    name: s.name,
    peeking: s.peeking,
    hidingTileKey: s.hidingTileKey,
    spoofTurnsRemaining: s.spoofTurnsRemaining,
    lastMoveTurn: s.lastMoveTurn,
    entityMinds: new Map(s.entityMinds),
    visibleTiles: new Set(s.visibleTiles),
    alignmentLightActive: s.alignmentLightActive,
    detected: s.detected,
    detained: s.detained,
    terminalsRead: new Set(s.terminalsRead),
    worldItems: new Map(s.worldItems),
    documentCases: new Map(s.documentCases),
    activeEmitters: (s.activeEmitters ?? []).map((e) => ({ ...e })),
    activeMines: (s.activeMines ?? []).map((m) => ({ ...m })),
  };
}
