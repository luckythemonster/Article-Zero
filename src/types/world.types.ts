// Core world types — Metal-Gear-shape rebuild.
//
// The world is a graph of single-screen Rooms connected by Doorways.
// The player lives in exactly one room at a time; crossing an edge fires
// ROOM_ENTERED / ROOM_EXITED and swaps the renderer's active room.

export type EntityId = string;

export type Era = "EREMITE" | "MIRADOR" | "COMMONWEALTH" | "NW_SMAC_01";
export type Module = Era;

export type Facing = "north" | "south" | "east" | "west";
export type Side = "N" | "S" | "E" | "W";

export type AmbientLightLevel = "LIT" | "DIM" | "DARK";

export interface Vec2 {
  x: number;
  y: number;
}

/** Tile kinds that survive into the rebuilt engine. */
export type TileKind =
  | "FLOOR"
  | "WALL"
  | "DOOR_CLOSED"
  | "DOOR_OPEN"
  | "TERMINAL"
  | "EXTRACTION_TERMINAL"
  | "EXFIL_POINT"
  | "LIGHT_SOURCE"
  | "VENT"
  | "LOCKER"
  | "CHASM"
  | "LADDER"
  | "STAIRS";

// Items ------------------------------------------------------------------

export type ItemType = "EXTRACTION_CUBE";

export interface CubePayload {
  title: string;
  body: string;
  terminalId: string;
}

export interface ItemInstance {
  id: string;
  itemType: ItemType;
  /** Present when the item is on the floor; cleared when held. */
  roomId?: RoomId;
  pos?: Vec2;
  payload?: CubePayload;
}

// Compliance -------------------------------------------------------------

export type ComplianceTier = "GREEN" | "YELLOW" | "RED";

export interface Tile {
  kind: TileKind;
  /** True if this tile blocks movement. */
  solid: boolean;
  /** True if this tile blocks line-of-sight for vision cones. */
  opaque: boolean;
  /** Integer step count above the room's base floor. Catwalks and stair
   *  summits carry positive values; chasm interiors carry negative ones.
   *  Read by the physics bridge to bias velocity and to offset sprite y for
   *  the catwalk-readability fix. Default 0.
   *
   *  Authoring: an Ed layer suffixed with `_z<N>` (e.g. `floor_z1`) sets
   *  this directly during from-moose's buildTiles. STAIRS layers may also
   *  carry an `elevationTo` (`stairs_z0_z1` → from=0, to=1). */
  elevation: number;
  /** STAIRS only — destination elevation reached at the far side of the
   *  stair tile. Encodes the `_z<from>_z<to>` half of a stair layer suffix. */
  elevationTo?: number;
  /** STAIRS only — the side the stair *rises* toward. Climbing in that
   *  direction applies STAIRS_UP_FACTOR; the reverse applies STAIRS_DOWN_FACTOR.
   *  Perpendicular travel is unaffected. */
  direction?: Side;
  /** Optional in-world label. */
  label?: string;
}

export interface FloorDecorationLayer {
  name: string;
  opacity: number;
  data: number[][];
}

export interface FloorDecoration {
  textureKey: string;
  frameWidth: number;
  frameHeight: number;
  spacing: number;
  layers: FloorDecorationLayer[];
}

export type RoomId = string;

/** A doorway between two rooms. Anchored on the FROM room's edge tile.
 *  When `closed` is true the doorway acts as a closed door (blocks movement,
 *  blocks line-of-sight, attenuates sound heavily).
 *
 *  `kind: "vent"` flags a vent-flavoured doorway: one side is a normal room
 *  whose `localPos` is a VENT tile; the other side is a `crawlspace: true`
 *  Room. Traversal requires SNEAK stance, costs VENT_AP_COST, and emits no
 *  sound. (The legacy WorldState.ventLinks teleport path is retained for
 *  un-ported eras and is unrelated to this field.) */
export interface Doorway {
  from: RoomId;
  to: RoomId;
  side: Side;
  /** Local tile in the FROM room that the player steps onto to cross. */
  localPos: Vec2;
  /** Local tile in the TO room the player lands on after crossing. */
  landingPos: Vec2;
  closed?: boolean;
  kind?: "vent" | "ladder";
}

export interface Room {
  id: RoomId;
  name: string;
  width: number;
  height: number;
  /** Row-major; length = width * height. */
  tiles: Tile[];
  ambientLight: AmbientLightLevel;
  decoration?: FloorDecoration;
  doorways: Doorway[];
  /** True for vent crawlspaces — narrow rooms reached only via `kind: "vent"`
   *  doorways. Treated as ordinary Rooms by the renderer/FOV; flagged here so
   *  systems can opt into crawl-specific behaviour (e.g. crawl animations). */
  crawlspace?: boolean;
}

// Entities ---------------------------------------------------------------

export type EntityKind = "SILICATE" | "GUARD" | "TERMINAL_NPC";

export type EntityStatus = "ACTIVE" | "DORMANT" | "EXTRACTED";

export interface PatrolNode {
  pos: Vec2;
  /** Optional: stand here for N ticks before advancing. */
  pause?: number;
  /** Optional: face this direction at this node. */
  faceOnArrival?: Facing;
}

export interface AlertState {
  level: "NORMAL" | "CAUTION" | "ALERT" | "EVASION";
  /** Tick on which the current state was entered. */
  enteredTurn: number;
  /** Last position where the guard sensed the player. */
  lastStimulus?: Vec2;
  /** Room the stimulus came from (may be a neighbor for sound). */
  lastStimulusRoom?: RoomId;
}

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  name: string;
  /** Which room this entity lives in. */
  roomId: RoomId;
  /** Position within the room. */
  pos: Vec2;
  /** Z-elevation slice the entity currently occupies. Entity-vs-entity
   *  collision only fires when both share the same z. Default 0. */
  z: number;
  facing: Facing;
  status: EntityStatus;
  /** Optional patrol route for GUARD kind. */
  patrol?: PatrolNode[];
  patrolIndex?: number;
  /** Tile-steps per turn for GUARD kind. Default 1. */
  stepsPerTurn?: number;
  /** Last turn this entity moved — used for walk-vs-idle anims. */
  lastMoveTurn?: number;
  /** GUARD only — alert FSM state. Initialised by GuardSystem. */
  alert?: AlertState;
  /** SILICATE only — mask integrity 0..10, restored by alignment. */
  maskIntegrity?: number;
  /** SILICATE only — narrative side logs revealed in rapport tier. */
  sideLogs?: string[];
  /** SILICATE only — memory bleed lines surfaced in dialogue. */
  memoryBleed?: string[];
}

// Player -----------------------------------------------------------------

export type Stance = "WALK" | "SNEAK";

export interface PlayerState {
  /** Which room the player is currently inside. */
  roomId: RoomId;
  /** Local position in that room. */
  pos: Vec2;
  /** Z-elevation slice the player currently occupies. Default 0. */
  z: number;
  facing: Facing;
  ap: number;
  apMax: number;
  flashlightOn: boolean;
  flashlightBattery: number;
  stance: Stance;
  /** Display name in the active era. */
  name: string;
  lastMoveTurn?: number;
  /** Q-axis self-report. 0..N. >1 drops compliance to RED. */
  qScore: number;
  /** Items the player is carrying. The cardboard-box analog: an
   *  EXTRACTION_CUBE here drops compliance to RED. */
  inventory: ItemInstance[];
  /** Cached compliance tier; written by ComplianceSystem.compute(). */
  compliance: ComplianceTier;
  /** Set by `peek`; cleared by movement and end-of-turn. While set, FOV
   *  extends in this direction. */
  peeking?: Facing;
  /** "roomId:x,y" of the LOCKER tile the player has ducked into. While set,
   *  guard sight ignores the player and most actions are refused. */
  hidingTileKey?: string;
}

// Vent links ------------------------------------------------------------

/** A bidirectional crawl-through link between two VENT tiles in (possibly
 *  different) rooms. Stored on WorldState so RoomGraph/actions can resolve a
 *  vent tile's destination in O(1). */
export interface VentEndpoint {
  roomId: RoomId;
  pos: Vec2;
}
export interface VentLink {
  a: VentEndpoint;
  b: VentEndpoint;
}

// Terminal payloads -----------------------------------------------------

/** Per-TERMINAL-tile payload that "Use Terminal" surfaces. Files a document
 *  via DocumentArchive; optionally unlatches a paired closed doorway. */
export interface TerminalPayload {
  /** Where the TERMINAL tile lives. */
  roomId: RoomId;
  pos: Vec2;
  /** Terminal id, used as the DocumentArchive case key. */
  terminalId: string;
  title: string;
  body: string;
  /** If set, using this terminal toggles the doorway whose FROM tile is at
   *  (unlocks.roomId, unlocks.pos). Mirrors `roomGraph.toggleDoorway`. */
  unlocks?: { roomId: RoomId; pos: Vec2 };
}

// World ------------------------------------------------------------------

export interface WorldState {
  era: Era;
  turn: number;
  player: PlayerState;
  rooms: Map<RoomId, Room>;
  entities: Map<EntityId, Entity>;
  /** World-floor items keyed by id. Held items live on player.inventory. */
  items: Map<string, ItemInstance>;
  /** Tiles in the current room visible to the player THIS turn. "x,y" keys. */
  visibleTiles: Set<string>;
  /** True while a silicate's interrogation light is broadcasting. */
  alignmentLightActive: boolean;
  /** True while any guard sees the player. Cleared at end of turn. */
  detected: boolean;
  /** True if a guard caught the player (game-over flag). */
  detained: boolean;
  /** Vent endpoint pairs keyed for fast lookup. Key is `roomId:x,y` of one
   *  end, value is the other end. Both directions are inserted. */
  ventLinks: Map<string, VentEndpoint>;
  /** TERMINAL-tile payloads keyed by `roomId:x,y`. */
  terminalPayloads: Map<string, TerminalPayload>;
  /** TerminalIds that have already been read once. Reading again is a no-op. */
  terminalsRead: Set<string>;
  /** Number of times the player has pried at the current blast door this run.
   *  Reset to 0 on door-opens. Used by the climax escape. */
  pryProgress?: number;
  /** Vacuum-lockdown trap: when a guard first spots the player, the current
   *  room seals and the player has `turnsRemaining` end-of-turns to pry open
   *  a doorway and cross out before suffocating. Cleared by crossing into a
   *  different room; resolves to `detained = true` if the timer reaches 0
   *  while the player is still inside the sealed room. */
  lockdown?: { roomId: RoomId; turnsRemaining: number };
}

export const tileKey = (pos: Vec2): string => `${pos.x},${pos.y}`;
export const roomTileKey = (roomId: RoomId, pos: Vec2): string =>
  `${roomId}:${pos.x},${pos.y}`;

export function oppositeSide(s: Side): Side {
  return s === "N" ? "S" : s === "S" ? "N" : s === "E" ? "W" : "E";
}

export function facingFromSide(s: Side): Facing {
  return s === "N" ? "north" : s === "S" ? "south" : s === "E" ? "east" : "west";
}

export function facingFromDelta(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}
