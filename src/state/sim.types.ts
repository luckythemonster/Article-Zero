// Physical/Subjective split — the dual-layer save format.
// Physical = the building (objective). Subjective = the prisoner (mind-state).
// Together they reconstruct a full WorldState.

import type {
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
  pos: Vec2;
  facing: Facing;
  status: EntityStatus;
  patrol?: PatrolNode[];
  patrolIndex?: number;
  stepsPerTurn?: number;
  lastMoveTurn?: number;
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
  lastMoveTurn?: number;
  entityMinds: Map<EntityId, EntityMind>;
  visibleTiles: Set<string>;
  alignmentLightActive: boolean;
  detected: boolean;
  detained: boolean;
  terminalsRead: Set<string>;
  worldItems: Map<string, ItemInstance>;
  documentCases: Map<string, DocumentCase>;
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
  lastMoveTurn?: number;
  entityMinds: [EntityId, EntityMind][];
  visibleTiles: string[];
  alignmentLightActive: boolean;
  detected: boolean;
  detained: boolean;
  terminalsRead: string[];
  worldItems: [string, ItemInstance][];
  documentCases: [string, DocumentCase][];
}

export interface SimSnapshot {
  physical: SerializedPhysical;
  subjective: SerializedSubjective | null;
  /** True if subjective was deliberately wiped (404 Wipe) rather than never saved. */
  subjectiveWiped: boolean;
}
