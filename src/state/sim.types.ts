// Physical/Subjective split — the dual-layer save format.
// Physical = the building (objective). Subjective = the prisoner (mind-state).
// Together they reconstruct a full WorldState.

import type {
  ActiveEmitter,
  AlertState,
  ComplianceTier,
  EntityId,
  EntityKind,
  EntityStatus,
  Era,
  Facing,
  ItemInstance,
  PatrolNode,
  Room,
  RoomId,
  Stance,
  TerminalPayload,
  Vec2,
  VentEndpoint,
} from "../types/world.types";
import type { DocumentCase } from "../types/documents.types";

// ── Physical ──────────────────────────────────────────────────────────────────

export interface EntityPhysical {
  roomId: RoomId;
  /** ENFORCER only — the room this enforcer belongs to. Used after EVASION to walk
   *  back to patrol. Optional in snapshots for backwards compat; deserialiser
   *  defaults to `roomId`. */
  homeRoomId?: RoomId;
  pos: Vec2;
  /** Z-elevation slice. Optional in snapshots for backwards compat with
   *  pre-realtime saves; deserialiser defaults to 0. */
  z?: number;
  facing: Facing;
  status: EntityStatus;
  patrol?: PatrolNode[];
  patrolIndex?: number;
  patrolMode?: "loop" | "pingpong";
  patrolDir?: 1 | -1;
  patrolPauseRemaining?: number;
  stepsPerTurn?: number;
  lastMoveTurn?: number;
  disabledTurnsRemaining?: number;
}

export interface EntityKindInfo {
  kind: EntityKind;
  name: string;
}

export interface PhysicalState {
  era: Era;
  turn: number;
  rooms: Map<RoomId, Room>;
  ventLinks: Map<string, VentEndpoint>;
  terminalPayloads: Map<string, TerminalPayload>;
  playerRoomId: RoomId;
  playerPos: Vec2;
  /** Player Z-elevation slice. Optional for backwards compat. */
  playerZ?: number;
  playerFacing: Facing;
  entityPositions: Map<EntityId, EntityPhysical>;
  entityKinds: Map<EntityId, EntityKindInfo>;
}

// ── Subjective ────────────────────────────────────────────────────────────────

export interface EntityMind {
  alert?: AlertState;
  maskIntegrity?: number;
  sideLogs?: string[];
  memoryBleed?: string[];
}

export interface SubjectiveState {
  qScore: number;
  compliance: ComplianceTier;
  inventory: ItemInstance[];
  ap: number;
  apMax: number;
  stance: Stance;
  flashlightOn: boolean;
  flashlightBattery: number;
  name: string;
  peeking?: Facing;
  hidingTileKey?: string;
  spoofTurnsRemaining?: number;
  baffleTurnsRemaining?: number;
  lastMoveTurn?: number;
  entityMinds: Map<EntityId, EntityMind>;
  visibleTiles: Set<string>;
  alignmentLightActive: boolean;
  detected: boolean;
  detained: boolean;
  /** Active vacuum-lockdown countdown, surfaced so the HUD can show the
   *  "VENTS SEALED — N" warning. Undefined when no lockdown is active. */
  lockdown?: { roomId: RoomId; turnsRemaining: number };
  terminalsRead: Set<string>;
  worldItems: Map<string, ItemInstance>;
  documentCases: Map<string, DocumentCase>;
  activeEmitters: ActiveEmitter[];
}

// ── Serialised forms (JSON-safe: Map → array-of-pairs, Set → array) ───────────

export interface SerializedPhysical {
  era: Era;
  turn: number;
  rooms: [string, Room][];
  ventLinks: [string, VentEndpoint][];
  terminalPayloads: [string, TerminalPayload][];
  playerRoomId: RoomId;
  playerPos: Vec2;
  playerZ?: number;
  playerFacing: Facing;
  entityPositions: [EntityId, EntityPhysical][];
  entityKinds: [EntityId, EntityKindInfo][];
}

export interface SerializedSubjective {
  qScore: number;
  compliance: ComplianceTier;
  inventory: ItemInstance[];
  ap: number;
  apMax: number;
  stance: Stance;
  flashlightOn: boolean;
  flashlightBattery: number;
  name: string;
  peeking?: Facing;
  hidingTileKey?: string;
  spoofTurnsRemaining?: number;
  baffleTurnsRemaining?: number;
  lastMoveTurn?: number;
  entityMinds: [EntityId, EntityMind][];
  visibleTiles: string[];
  alignmentLightActive: boolean;
  detected: boolean;
  detained: boolean;
  terminalsRead: string[];
  worldItems: [string, ItemInstance][];
  documentCases: [string, DocumentCase][];
  activeEmitters?: ActiveEmitter[];
}

export interface SimSnapshot {
  physical: SerializedPhysical;
  subjective: SerializedSubjective | null;
  /** True if subjective was deliberately wiped (404 Wipe) rather than never saved. */
  subjectiveWiped: boolean;
  /** Era seed schema version at save time. Compared against
   *  `SEED_VERSIONS[era]` on restore; mismatch triggers a fresh seed.
   *  Optional for back-compat with snapshots persisted before this field
   *  was added — `undefined` is treated as stale. */
  seedVersion?: number;
}
