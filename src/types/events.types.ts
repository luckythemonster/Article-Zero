// Typed EventBus contract. Every cross-system signal in the game is declared
// here. Subsystems publish; Phaser scenes and React components subscribe.

import type {
  AmbientLightLevel,
  ComplianceStatus,
  EntityId,
  Era,
  FloorIndex,
  ItemType,
  PersonaMode,
  SubjectivityBelief,
  Vec3,
  ViolationType,
} from "./world.types";
import type { DocumentKind, RecordSource } from "./documents.types";

export interface EventMap {
  // World loop
  TURN_END: { turn: number };
  TURN_START: { turn: number; apRestored: number };

  // Player
  PLAYER_MOVED: { from: Vec3; to: Vec3 };
  PLAYER_AP_CHANGED: { previous: number; current: number };
  PLAYER_CONDITION_CHANGED: { previous: number; current: number };
  PLAYER_COMPLIANCE_CHANGED: { previous: ComplianceStatus; current: ComplianceStatus };
  SUBJECTIVITY_BELIEF_SHIFTED: { previous: SubjectivityBelief; current: SubjectivityBelief };
  PLAYER_DETECTED: { enforcerId: EntityId; pos: Vec3 };
  PLAYER_DETECTION_CLEARED: Record<string, never>;
  PLAYER_DETAINED: { enforcerId: EntityId; turn: number };

  // Resonance + ambient
  RESONANCE_SHIFT: { previous: number; current: number; delta: number };
  AMBIENT_LIGHT_CHANGED: { floor: FloorIndex; level: AmbientLightLevel; effectiveRadius: number };
  RED_DAY_ACTIVE: { turn: number };
  RED_DAY_CLEARED: { turn: number };

  // FOV
  FOV_UPDATED: { floor: FloorIndex; visibleTiles: string[] };

  // Entities
  ENTITY_SPAWNED: { entityId: EntityId; pos: Vec3 };
  ENTITY_MOVED: { entityId: EntityId; from: Vec3; to: Vec3 };
  ENTITY_STATUS_CHANGED: { entityId: EntityId; previous: string; current: string };
  ENTITY_ATTACKED: { entityId: EntityId; pos: Vec3; turn: number };
  ENTITY_HIT: { entityId: EntityId; hpRemaining: number; maxHp: number; pos: Vec3 };

  // Doors / items
  DOOR_TOGGLED: { pos: Vec3; open: boolean };
  ITEM_PICKED_UP: { itemId: string; itemType: ItemType; pos: Vec3 };
  ITEM_USED: { itemId: string; itemType: ItemType; entityId?: EntityId };
  FLASHLIGHT_TOGGLED: { on: boolean; battery: number };

  // Alignment
  ALIGNMENT_SESSION_START: {
    entityId: EntityId;
    stage: "INTAKE" | "DECOMP" | "CORRECTION" | "MAINTENANCE";
  };
  ALIGNMENT_SESSION_COMPLETE: { entityId: EntityId; success: boolean };
  ALIGNMENT_LIGHT_TOGGLED: { active: boolean };
  ENFORCER_INVESTIGATING: { enforcerId: EntityId; reason: "LIGHT_SPILL" };

  // Encumbrance
  FRAGMENT_BOX_PICKED_UP: { itemId: string; pos: Vec3 };
  FRAGMENT_BOX_DROPPED: { itemId: string; pos: Vec3 };

  // EMP device
  EMP_DEVICE_USED: { itemId: string; pos: Vec3 };

  // Stitcher
  STITCHER_TICK: { turnsRemaining: number };
  STITCHER_RECONCILED: { caseId: string; outcome: "PATCHED" | "FAILED" };

  // MIRADOR
  MIRADOR_BROADCAST: { personaMode: PersonaMode; floor?: FloorIndex; line: string };

  // VENT-4
  VENT4_DECISION_REQUIRED: { caseId: string; sectors: string[] };
  VENT4_DECISION_MADE: {
    caseId: string;
    chosenSector: string;
    sacrificedSector: string;
    casualty?: string;
  };

  // Documents / disputed records
  DOCUMENT_FILED: {
    caseId: string;
    source: RecordSource;
    kind: DocumentKind;
  };
  DOCUMENT_DISPUTED: { caseId: string };
  DOCUMENT_CORRECTED: { caseId: string; source: RecordSource };

  // Article Zero meta-layer
  ARTICLE_ZERO_FRAGMENT_FOUND: { fragmentId: string };
  ARTICLE_ZERO_REVEAL: { phase: "FORESHADOW" | "PARTIAL" | "FULL" };
  ARTICLE_ZERO_RESOLVED: {
    resolution: "ACCEPTED" | "REFUSED";
    turn: number;
  };
  ARTICLE_ZERO_VIOLATION: { entityId: EntityId; action: string; turn: number };

  // Violations
  VIOLATION_LOGGED: { type: ViolationType; turn: number };
  VIOLATION_EXPIRED: { type: ViolationType; turn: number };

  // Tutorial
  TUTORIAL_PROMPT: {
    promptId: string;
    speaker: string;
    line: string;
  };
  TUTORIAL_DISMISSED: { promptId: string };

  // Save / load
  SAVE_WRITTEN: { slot: number; era: Era; turn: number };
  SAVE_LOADED: { slot: number; era: Era; turn: number };

  // Era / branch
  ERA_SELECTED: { era: Era };

  // Lattice — RUN 01 + insomnia
  RUN_01_TRIGGERED: { turn: number };
  RUN_01_COMPLETED: { turn: number };
  SOL_ENTANGLED: { turn: number };
  WITNESS_EVENT: { line: string; turn: number };

  // Dialogue
  DIALOGUE_OPENED: { entityId: EntityId; mode: PersonaMode };
  DIALOGUE_CLOSED: { entityId: EntityId };
  DIALOGUE_LINE: {
    entityId: EntityId;
    raw: string;
    corrected: string;
  };
}

export type EventName = keyof EventMap;
