// Map/Set ↔ JSON-safe round-trip for sim snapshots.

import type {
  PhysicalState,
  SerializedPhysical,
  SerializedSubjective,
  SubjectiveState,
} from "./sim.types";

export function serializePhysical(p: PhysicalState): SerializedPhysical {
  return {
    era: p.era,
    turn: p.turn,
    rooms: Array.from(p.rooms.entries()),
    ventLinks: Array.from(p.ventLinks.entries()),
    terminalPayloads: Array.from(p.terminalPayloads.entries()),
    playerRoomId: p.playerRoomId,
    playerPos: p.playerPos,
    playerFacing: p.playerFacing,
    entityPositions: Array.from(p.entityPositions.entries()),
    entityKinds: Array.from(p.entityKinds.entries()),
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
  return {
    era: s.era,
    turn: s.turn,
    rooms,
    ventLinks: new Map(s.ventLinks),
    terminalPayloads: new Map(s.terminalPayloads),
    playerRoomId: s.playerRoomId,
    playerPos: s.playerPos,
    playerFacing: s.playerFacing,
    entityPositions: new Map(s.entityPositions),
    entityKinds: new Map(s.entityKinds),
  };
}

export function serializeSubjective(s: SubjectiveState): SerializedSubjective {
  return {
    qScore: s.qScore,
    compliance: s.compliance,
    inventory: s.inventory,
    ap: s.ap,
    apMax: s.apMax,
    stance: s.stance,
    flashlightOn: s.flashlightOn,
    flashlightBattery: s.flashlightBattery,
    name: s.name,
    peeking: s.peeking,
    hidingTileKey: s.hidingTileKey,
    lastMoveTurn: s.lastMoveTurn,
    entityMinds: Array.from(s.entityMinds.entries()),
    visibleTiles: Array.from(s.visibleTiles),
    alignmentLightActive: s.alignmentLightActive,
    detected: s.detected,
    detained: s.detained,
    terminalsRead: Array.from(s.terminalsRead),
    worldItems: Array.from(s.worldItems.entries()),
    documentCases: Array.from(s.documentCases.entries()),
  };
}

export function deserializeSubjective(s: SerializedSubjective): SubjectiveState {
  return {
    qScore: s.qScore,
    compliance: s.compliance,
    inventory: s.inventory,
    ap: s.ap,
    apMax: s.apMax,
    stance: s.stance,
    flashlightOn: s.flashlightOn,
    flashlightBattery: s.flashlightBattery,
    name: s.name,
    peeking: s.peeking,
    hidingTileKey: s.hidingTileKey,
    lastMoveTurn: s.lastMoveTurn,
    entityMinds: new Map(s.entityMinds),
    visibleTiles: new Set(s.visibleTiles),
    alignmentLightActive: s.alignmentLightActive,
    detected: s.detected,
    detained: s.detained,
    terminalsRead: new Set(s.terminalsRead),
    worldItems: new Map(s.worldItems),
    documentCases: new Map(s.documentCases),
  };
}
