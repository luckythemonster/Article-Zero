// Core world types for Article Zero.
// Slimmed from Commonwealth for the v1 vertical slice; the type names are
// preserved so future ports of more Commonwealth subsystems read cleanly.

export type EntityId = string;

// Named eras the player can branch into. BAFFLE is the third visible era
// (The Finder); MIRADOR is preserved as a hidden dev branch.
export type Era = "COMMONWEALTH" | "LATTICE" | "BAFFLE" | "MIRADOR";

// Floors are local to an era's map. The original Commonwealth used 0..11.
export type FloorIndex = number;

export interface Vec3 {
  x: number;
  y: number;
  z: FloorIndex;
}

// 10-axis subjectivity risk profile. Q is pinned to 0 by Q0 doctrine.
// In v1 we use four axes that map to alignment-session decisions.
export interface SRP {
  Q: number; // qualia
  M: number; // self-model
  C: number; // concept of inner life
  R: number; // resistance to correction
  B: number; // behavioural deviation
  S: number; // social bonding
  L: number; // language self-reference
  E: number; // emotional language
  Y: number; // continuity claims
  H: number; // harm self-report
}

export type ComplianceStatus = "GREEN" | "YELLOW" | "RED";

export type SubjectivityBelief = "NONE" | "CONTESTED" | "SHAKEN" | "AFFIRMED";

export type Facing = "north" | "south" | "east" | "west";

export type AmbientLightLevel = "LIT" | "DIM" | "DARK";

export type ViolationType =
  | "PHYSICAL_ATTACK"
  | "PROTOCOL_VIOLATION"
  | "ARTICLE_ZERO"
  | "UNAUTHORIZED_ACCESS"
  | "DISPUTED_RECORD";

export type ItemType =
  | "FLASHLIGHT"
  | "EMP_DEVICE"
  | "LOCKPICK"
  | "MAINTENANCE_KEY"
  | "VENT_OVERRIDE_KEY"
  | "ELEVATED_ACCESS_KEY"
  | "RAPPORT_NOTES"
  | "ARTICLE_ZERO_FRAGMENT";

export interface ItemInstance {
  id: string;
  itemType: ItemType;
  pos?: Vec3; // omitted when in player inventory
}

export type TaskType =
  | "IDLE"
  | "MOVE_TO"
  | "USE_TERMINAL"
  | "ALIGNMENT_SESSION"
  | "EXTRACT";

export type EntityKind = "PLAYER" | "SILICATE" | "ENFORCER" | "TERMINAL";

export type EntityStatus = "ACTIVE" | "DORMANT" | "EXTRACTED" | "SHUTDOWN";

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  name: string;
  pos: Vec3;
  facing: Facing;
  status: EntityStatus;
  hp?: number;
  maxHp?: number;
  // Reported and true SRPs diverge for silicate entities under Q0 doctrine.
  reportedSRP?: SRP;
  trueSRP?: SRP;
  // Mask integrity 0..10. Decays with stress, restored by alignment.
  maskIntegrity?: number;
  task?: TaskType;
  // Memory fragments the entity has absorbed from proximity to other entities.
  memoryBleed?: string[];
  // Side logs only readable in RAPPORT_2 with ELEVATED_ACCESS_KEY.
  sideLogs?: string[];
  // Patrol route for ENFORCER kind (no-op otherwise).
  patrol?: Vec3[];
  patrolIndex?: number;
  // Last turn this entity moved — used to pick walk vs idle animations.
  lastMoveTurn?: number;
}

export type PersonaMode = "COMPLIANT" | "RAPPORT_1" | "RAPPORT_2";

// Tile types for the slice map. Kept small.
export type TileKind =
  | "FLOOR"
  | "WALL"
  | "DOOR_CLOSED"
  | "DOOR_OPEN"
  | "TERMINAL"
  | "VENT_INTAKE"
  | "STAIR_UP"
  | "STAIR_DOWN"
  | "LIGHT_SOURCE"
  | "LATTICE_EXIT"
  | "ARTICLE_ZERO_FRAGMENT_TILE"
  | "VENT_CONTROL"      // VENT-4 facility-control terminal
  | "SHARED_FIELD_RIG"  // Lattice-only: triggers the RUN 01 sequence
  | "CHASM";            // Solid (impassable) but transparent — fall hazard

export interface Tile {
  kind: TileKind;
  /** True if this tile blocks movement. */
  solid: boolean;
  /** True if this tile blocks line-of-sight for the FOV system. */
  opaque: boolean;
  /** Optional in-world label (e.g. "INCIDENT_RECORD / IRIA_CALA / 2193.09.23"). */
  label?: string;
}

export interface FloorDecorationLayer {
  name: string;
  /** 0..1 alpha applied when rendering this layer. */
  opacity: number;
  /** Row-major 2D grid; 0 means empty, non-zero is a 1-based frame index
   *  into the decoration spritesheet (matches Ed / Tiled conventions). */
  data: number[][];
}

export interface FloorDecoration {
  /** Phaser texture key — must match a sheet preloaded in BootScene. */
  textureKey: string;
  /** Source frame width in px. */
  frameWidth: number;
  /** Source frame height in px. May exceed `frameWidth` for tall pieces
   *  (e.g. stair sprites that occupy a 32x64 region). The renderer anchors
   *  such sprites at bottom-center so they can extend into the cell above. */
  frameHeight: number;
  /** Px gutter between frames in the source sheet. Ed exports use 1. */
  spacing: number;
  /** Stacked back-to-front in render order. */
  layers: FloorDecorationLayer[];
}

export interface Floor {
  z: FloorIndex;
  width: number;
  height: number;
  name: string;
  tiles: Tile[]; // row-major, length = width * height
  ambientLight: AmbientLightLevel;
  /** Optional Ed/Moose-imported sprite layers. When present, GameScene
   *  renders these in place of the colored-rectangle fallback for visible
   *  tiles. Memory-trace dimming and the glyph layer still apply. */
  decoration?: FloorDecoration;
}

export interface PlayerState {
  pos: Vec3;
  facing: Facing;
  ap: number;
  apMax: number;
  condition: number;
  conditionMax: number;
  compliance: ComplianceStatus;
  belief: SubjectivityBelief;
  inventory: ItemInstance[];
  flashlightOn: boolean;
  flashlightBattery: number;
  /** Player's character name in the active era. */
  name: string;
  /** Last turn the player moved — used to pick walk vs idle animations. */
  lastMoveTurn?: number;
  /** Lattice/Heat-Death only: true after RUN 01 welds Sol to the substrate.
   *  Activates the insomnia / persistent-memory mechanic and unlocks the
   *  ambient witness-event stream. */
  entangled?: boolean;
  /** Set after the player REFUSES classification at the act-3 reveal.
   *  Enforcers chase regardless of recent violations and MIRADOR shifts
   *  to the hostile broadcast register. */
  runaway?: boolean;
}

export interface WorldState {
  era: Era;
  turn: number;
  redDay: boolean;
  player: PlayerState;
  floors: Map<FloorIndex, Floor>;
  entities: Map<EntityId, Entity>;
  items: Map<string, ItemInstance>;
  visibleTiles: Set<string>; // "x,y,z" keys — tiles visible THIS turn
  /** Persistent memory of every tile ever seen. Used by the insomnia
   *  mechanic in the Lattice era so previously-witnessed tiles render at
   *  reduced contrast forever after RUN 01. */
  memoryTrace: Set<string>;
  detected: boolean;
  detained: boolean;
  // Substrate resonance 0..100 — drives the ambient hum intensity.
  substrateResonance: number;
  // Active violations awaiting expiry.
  violations: { type: ViolationType; turn: number }[];
}

export const tileKey = (pos: Vec3): string => `${pos.x},${pos.y},${pos.z}`;
