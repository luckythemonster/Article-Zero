// Adapters between WorldState (WorldEngine's flat runtime format) and the
// Physical/Subjective slice pair used by the store.

import type { Entity, WorldState } from "../types/world.types";
import type {
  EntityKindInfo,
  EntityMind,
  EntityPhysical,
  PhysicalState,
  SubjectiveState,
} from "./sim.types";
import { documentArchive } from "../engine/DocumentArchive";

/** Split a WorldState into Physical + Subjective slices. */
export function worldStateToSlices(ws: WorldState): {
  physical: PhysicalState;
  subjective: SubjectiveState;
} {
  const entityPositions = new Map<string, EntityPhysical>();
  const entityKinds = new Map<string, EntityKindInfo>();
  const entityMinds = new Map<string, EntityMind>();

  for (const [id, e] of ws.entities) {
    entityPositions.set(id, {
      roomId: e.roomId,
      homeRoomId: e.homeRoomId,
      pos: e.pos,
      z: e.z,
      facing: e.facing,
      status: e.status,
      patrol: e.patrol,
      patrolIndex: e.patrolIndex,
      patrolMode: e.patrolMode,
      patrolDir: e.patrolDir,
      patrolPauseRemaining: e.patrolPauseRemaining,
      stepsPerTurn: e.stepsPerTurn,
      lastMoveTurn: e.lastMoveTurn,
      disabledTurnsRemaining: e.disabledTurnsRemaining,
      blindnessTurnsRemaining: e.blindnessTurnsRemaining,
    });
    entityKinds.set(id, { kind: e.kind, name: e.name });
    entityMinds.set(id, {
      alert: e.alert,
      maskIntegrity: e.maskIntegrity,
      sideLogs: e.sideLogs,
      memoryBleed: e.memoryBleed,
    });
  }

  const physical: PhysicalState = {
    era: ws.era,
    turn: ws.turn,
    rooms: new Map(ws.rooms),
    ventLinks: new Map(ws.ventLinks),
    terminalPayloads: new Map(ws.terminalPayloads),
    chestPayloads: new Map(ws.chestPayloads),
    playerRoomId: ws.player.roomId,
    playerPos: ws.player.pos,
    playerZ: ws.player.z,
    playerFacing: ws.player.facing,
    entityPositions,
    entityKinds,
    atmosphere: new Map(
      [...ws.atmosphere].map(([id, a]) => [id, { ...a }]),
    ),
    hvacZones: new Map(
      [...ws.hvacZones].map(([id, z]) => [
        id,
        { ...z, roomIds: [...z.roomIds] },
      ]),
    ),
  };

  const subjective: SubjectiveState = {
    qScore: ws.player.qScore,
    compliance: ws.player.compliance,
    inventory: [...ws.player.inventory],
    objectives: [...ws.player.objectives],
    ap: ws.player.ap,
    apMax: ws.player.apMax,
    stance: ws.player.stance,
    flashlightOn: ws.player.flashlightOn,
    flashlightBattery: ws.player.flashlightBattery,
    name: ws.player.name,
    peeking: ws.player.peeking,
    hidingTileKey: ws.player.hidingTileKey,
    spoofTurnsRemaining: ws.player.spoofTurnsRemaining,
    lastMoveTurn: ws.player.lastMoveTurn,
    entityMinds,
    visibleTiles: new Set(ws.visibleTiles),
    alignmentLightActive: ws.alignmentLightActive,
    detected: ws.detected,
    detained: ws.detained,
    lockdown: ws.lockdown ? { ...ws.lockdown } : undefined,
    terminalsRead: new Set(ws.terminalsRead),
    worldItems: new Map(ws.items),
    // Filed records (extraction docs, alignment transcripts, VENT-4) live in the
    // documentArchive singleton — pull them into the subjective slice so they
    // persist through the physical/subjective save format.
    documentCases: new Map(documentArchive.list().map((c) => [c.id, c])),
    activeEmitters: ws.activeEmitters.map((e) => ({ ...e })),
    activeMines: ws.activeMines.map((m) => ({ ...m })),
  };

  return { physical, subjective };
}

/** Reconstruct a full WorldState from Physical + Subjective slices. */
export function slicesToWorldState(
  physical: PhysicalState,
  subjective: SubjectiveState,
): WorldState {
  const entities = new Map<string, Entity>();
  for (const [id, phys] of physical.entityPositions) {
    const kind = physical.entityKinds.get(id);
    const mind = subjective.entityMinds.get(id);
    entities.set(id, {
      id,
      kind: kind?.kind ?? "ENFORCER",
      name: kind?.name ?? id,
      roomId: phys.roomId,
      homeRoomId: phys.homeRoomId ?? phys.roomId,
      pos: phys.pos,
      z: phys.z ?? 0,
      facing: phys.facing,
      status: phys.status,
      patrol: phys.patrol,
      patrolIndex: phys.patrolIndex,
      patrolMode: phys.patrolMode,
      patrolDir: phys.patrolDir,
      patrolPauseRemaining: phys.patrolPauseRemaining,
      stepsPerTurn: phys.stepsPerTurn,
      lastMoveTurn: phys.lastMoveTurn,
      disabledTurnsRemaining: phys.disabledTurnsRemaining,
      blindnessTurnsRemaining: phys.blindnessTurnsRemaining,
      alert: mind?.alert,
      maskIntegrity: mind?.maskIntegrity,
      sideLogs: mind?.sideLogs,
      memoryBleed: mind?.memoryBleed,
    });
  }

  return {
    era: physical.era,
    turn: physical.turn,
    player: {
      roomId: physical.playerRoomId,
      pos: physical.playerPos,
      z: physical.playerZ ?? 0,
      facing: physical.playerFacing,
      ap: subjective.ap,
      apMax: subjective.apMax,
      flashlightOn: subjective.flashlightOn,
      flashlightBattery: subjective.flashlightBattery,
      stance: subjective.stance,
      name: subjective.name,
      lastMoveTurn: subjective.lastMoveTurn,
      qScore: subjective.qScore,
      inventory: [...subjective.inventory],
      objectives: [...(subjective.objectives ?? [])],
      compliance: subjective.compliance,
      peeking: subjective.peeking,
      hidingTileKey: subjective.hidingTileKey,
      spoofTurnsRemaining: subjective.spoofTurnsRemaining,
    },
    rooms: new Map(physical.rooms),
    entities,
    items: new Map(subjective.worldItems),
    visibleTiles: new Set(subjective.visibleTiles),
    alignmentLightActive: subjective.alignmentLightActive,
    detected: subjective.detected,
    detained: subjective.detained,
    lockdown: subjective.lockdown ? { ...subjective.lockdown } : undefined,
    ventLinks: new Map(physical.ventLinks),
    terminalPayloads: new Map(physical.terminalPayloads),
    chestPayloads: new Map(physical.chestPayloads),
    terminalsRead: new Set(subjective.terminalsRead),
    activeEmitters: subjective.activeEmitters.map((e) => ({ ...e })),
    activeMines: subjective.activeMines.map((m) => ({ ...m })),
    atmosphere: new Map(
      [...(physical.atmosphere ?? new Map())].map(([id, a]) => [id, { ...a }]),
    ),
    hvacZones: new Map(
      [...(physical.hvacZones ?? new Map())].map(([id, z]) => [
        id,
        { ...z, roomIds: [...z.roomIds] },
      ]),
    ),
  };
}
