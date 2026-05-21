// Typed EventBus contract — the rebuilt event surface.
// Every cross-system signal in the game is declared here.

import type {
  AmbientLightLevel,
  ComplianceTier,
  EntityId,
  Era,
  Facing,
  ItemType,
  RoomId,
  Stance,
  Vec2,
} from "./world.types";

export interface EventMap {
  // World boot
  ERA_SELECTED: { era: Era };

  // Turn cadence
  TURN_START: { turn: number; apRestored: number };
  TURN_END: { turn: number };

  // Player
  PLAYER_MOVED: { from: Vec2; to: Vec2; roomId: RoomId };
  PLAYER_AP_CHANGED: { previous: number; current: number };
  PLAYER_FACING_CHANGED: { facing: Facing };
  PLAYER_STANCE_CHANGED: { stance: Stance };
  PLAYER_DETECTED: { guardId: EntityId; pos: Vec2 };
  PLAYER_DETECTION_CLEARED: Record<string, never>;
  PLAYER_DETAINED: { guardId: EntityId; turn: number };

  // Rooms
  ROOM_ENTERED: { roomId: RoomId; from?: RoomId };
  ROOM_EXITED: { roomId: RoomId };
  DOOR_TOGGLED: { roomId: RoomId; pos: Vec2; open: boolean };

  // FOV / lighting
  FOV_UPDATED: { roomId: RoomId; visibleTiles: string[] };
  AMBIENT_LIGHT_CHANGED: { roomId: RoomId; level: AmbientLightLevel; effectiveRadius: number };
  FLASHLIGHT_TOGGLED: { on: boolean; battery: number };
  LIGHT_TOGGLED: {
    roomId: RoomId;
    switchPos: Vec2;
    lightPositions: Vec2[];
    on: boolean;
  };

  // Entities
  ENTITY_MOVED: { entityId: EntityId; roomId: RoomId; from: Vec2; to: Vec2 };
  /** Per-tile-step footstep emitted by a guard. Distinct from SOUND_EMITTED:
   *  guard footsteps are for audio only and never feed back into the
   *  AlertFSM / SoundField (that would let the player exploit guard noise
   *  as a sonar ping). */
  GUARD_FOOTSTEP: { guardId: EntityId; roomId: RoomId; pos: Vec2 };
  ENTITY_FACING_CHANGED: { entityId: EntityId; facing: Facing };
  ENTITY_STATUS_CHANGED: { entityId: EntityId; previous: string; current: string };

  // Guards (M2)
  GUARD_ALERT_CHANGED: {
    guardId: EntityId;
    from: "NORMAL" | "CAUTION" | "ALERT" | "EVASION";
    to: "NORMAL" | "CAUTION" | "ALERT" | "EVASION";
  };
  EXCLAMATION_TRIGGERED: { guardId: EntityId; pos: Vec2; roomId: RoomId };
  GUARD_VISION_UPDATED: { guardId: EntityId; visibleTiles: string[] };

  // Sound (M3)
  SOUND_EMITTED: { roomId: RoomId; pos: Vec2; intensity: number; reason: string };

  // Alignment (M5 — re-bound)
  ALIGNMENT_SESSION_START: {
    entityId: EntityId;
    stage: "INTAKE" | "DECOMP" | "CORRECTION";
  };
  ALIGNMENT_SESSION_COMPLETE: { entityId: EntityId; success: boolean };
  ALIGNMENT_LIGHT_TOGGLED: { active: boolean };

  // Extraction terminal (M4)
  EXTRACTION_STARTED: { terminalId: string; roomId: RoomId };
  EXTRACTION_PROGRESS: { terminalId: string; progress: number; required: number };
  EXTRACTION_COMPLETED: { terminalId: string; caseId: string };
  EXTRACTION_INTERRUPTED: { terminalId: string; reason: string };

  // Documents
  DOCUMENT_FILED: { caseId: string; source: "OFFICIAL" | "WITNESS" | "SYSTEM"; kind: string };

  // Compliance / heist loop
  COMPLIANCE_CHANGED: {
    previous: ComplianceTier;
    current: ComplianceTier;
    reasons: string[];
  };
  Q_SCORE_CHANGED: { previous: number; current: number };
  ITEM_SPAWNED: { itemId: string; itemType: ItemType; roomId: RoomId; pos: Vec2 };
  ITEM_PICKED_UP: { itemId: string; itemType: ItemType };
  ITEM_FILED: { itemId: string; caseId: string };
  ITEM_USED: { itemId: string; itemType: ItemType };
  ITEM_DEPLOYED: { itemType: ItemType; roomId: RoomId; pos: Vec2; turnsRemaining: number };
  ITEM_THROWN: { itemType: ItemType; targetEntityId: EntityId };
  ITEM_REJECTED: { itemType: ItemType; reason: string };
  ITEM_EFFECT_STARTED: { effect: "spoof" | "baffle"; turnsRemaining: number };
  EFFECT_EXPIRED: { effect: "spoof" | "baffle" };

  // 404 Wipe
  SUBJECTIVE_WIPED: Record<string, never>;

  // Dialogue
  DIALOGUE_OPENED: { entityId: EntityId };
  DIALOGUE_CLOSED: { entityId: EntityId };
  DIALOGUE_LINE: { entityId: EntityId; raw: string; corrected: string };

  // Verb extensions (terminal/vent/hide/peek)
  TERMINAL_USED: { terminalId: string; roomId: RoomId; pos: Vec2; caseId: string };
  PLAYER_VENTED: { from: { roomId: RoomId; pos: Vec2 }; to: { roomId: RoomId; pos: Vec2 } };
  PLAYER_HIDDEN: { roomId: RoomId; pos: Vec2 };
  PLAYER_UNHIDDEN: { roomId: RoomId; pos: Vec2 };
  PLAYER_PEEKED: { facing: Facing | null };
  PLAYER_PRIED_DOOR: { roomId: RoomId; pos: Vec2; presses: number; required: number };
  INTERACT_REJECTED: { action: "vent"; reason: "needs_sneak" | "needs_ap" | "no_link" };

  // Vertical-slice phase orchestration
  AUDIT_LOCKDOWN_TRIGGERED: { reason: string };
  LOCKDOWN_TRIGGERED: { roomId: RoomId; turnsRemaining: number };
  PHASE_RESTART_REQUESTED: { reason: string };
  OXYGEN_TICK: { remainingSeconds: number; totalSeconds: number };
  CLIMAX_ESCAPED: Record<string, never>;
}

export type EventName = keyof EventMap;
