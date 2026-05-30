// Core world types — Metal-Gear-shape rebuild.
//
// The world is a graph of single-screen Rooms connected by Doorways.
// The player lives in exactly one room at a time; crossing an edge fires
// ROOM_ENTERED / ROOM_EXITED and swaps the renderer's active room.

export type EntityId = string;

export type Era = "EREMITE" | "MIRADOR" | "COMMONWEALTH" | "NW_SMAC_01" | "TEST_MAP";
export type Module = Era;

export type Facing = "north" | "south" | "east" | "west";
export type Side = "N" | "S" | "E" | "W";

export type AmbientLightLevel = "LIT" | "DIM" | "DARK";

/** Footstep surface families. Drives sample selection for footstep SFX.
 *  Resolved from a tile via `tileSurface()`; FLOOR may be overridden per Room
 *  via `Room.floorSurface`. */
export type SurfaceType =
  | "dirtyground"
  | "gravel"
  | "metalv1"
  | "metalv2"
  | "rock"
  | "tile"
  | "wood";

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
  | "LIGHT_SWITCH"
  | "VENT"
  | "LOCKER"
  | "ITEM_CHEST"
  | "CHASM"
  | "LADDER"
  | "STAIRS"
  | "CHAIN_LINK_FENCE";

// Items ------------------------------------------------------------------

export type ItemType =
  | "EXTRACTION_CUBE"
  | "BYPASS_DRIVE"
  | "PHANTOM_EMITTER"
  | "Q0_SPOOF_BADGE"
  | "DUMP_FRAGMENT"
  | "THERMAL_BAFFLE"
  | "OVERRIDE_KEY"
  | "EMP"
  | "EMP_GRENADE"
  | "Q_MINE";

/** Ephemeral world-state for a deployed Phantom Manifest Emitter. Tracked on
 *  WorldState.activeEmitters; consumed at the top of advanceTurn() to push a
 *  SoundField emission and decrement turnsRemaining. */
export interface ActiveEmitter {
  id: string;
  roomId: RoomId;
  pos: Vec2;
  intensity: number;
  turnsRemaining: number;
  reason: string;
}

/** Ephemeral world-state for a placed Q-mine. Tracked on WorldState.activeMines;
 *  scanned each turn in advanceTurn() after enforcers move. When an ACTIVE
 *  ENFORCER enters `radius` the mine induces an "expression of subjectivity" in
 *  that unit (it flees toward the EXFIL_POINT) and is consumed. */
export interface ActiveMine {
  id: string;
  roomId: RoomId;
  pos: Vec2;
  radius: number;
}

// Atmospherics ----------------------------------------------------------

/** HVAC operating mode. NORMAL drifts toward the zone setpoint; emergency modes
 *  pin overrides and only resolve when the player swaps them off. */
export type HvacMode =
  | "NORMAL"
  | "MAX_COOL"
  | "MAX_HEAT"
  | "PURGE"
  | "OXYGEN_CUTOFF";

/** A multi-room climate zone driven by an HVAC console. Wall thermostats edit
 *  the zone of their host room directly; they cannot set emergency modes. */
export interface HvacZone {
  id: string;
  roomIds: RoomId[];
  setpoint: number;
  mode: HvacMode;
}

/** Per-room sim state propagated by AtmosphericsField each turn. Temperatures in
 *  °C; airflow and oxygen on a 0–100 scale. Default comfort: 21°C / 50 / 100. */
export interface RoomAtmosphere {
  roomId: RoomId;
  zoneId?: string;
  temperature: number;
  airflow: number;
  oxygen: number;
}

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
  /** LIGHT_SOURCE only. Manhattan-tile radius of emitted light. Default 4 if
   *  unspecified. Used by LightField to compute the per-room lit-tile set. */
  emissionRadius?: number;
  /** LIGHT_SOURCE only. Mutable runtime on/off state. Default true at seed
   *  time. Switches and terminal payloads flip this; recomputeFOV reads it. */
  lightOn?: boolean;
  /** DOOR_CLOSED only. When true the door can't be opened by walking up and
   *  interacting — it's operated solely by its wired LIGHT_SWITCH. */
  locked?: boolean;
}

/** Wiring between a LIGHT_SWITCH tile and the LIGHT_SOURCE tiles it controls.
 *  Stored on Room. Empty `controls` means "all LIGHT_SOURCE tiles in this
 *  room" (the default for single-switch rooms). */
export interface LightSwitch {
  pos: Vec2;
  controls: Vec2[];
  /** DOOR tiles this switch toggles. Operated as a coupled set alongside the
   *  light `controls`; locked doors are openable only via their switch. */
  doorControls?: Vec2[];
}

/** A virtual cross-room light emission — e.g. a floor vent letting light from
 *  the room above bleed into a crawlspace below. Computed by WorldEngine
 *  after every light toggle, never authored by hand or persisted in saves.
 *  Treated by LightField identically to a LIGHT_SOURCE tile at `pos`. */
export interface BleedLight {
  pos: Vec2;
  radius: number;
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
  /** LIGHT_SWITCH wiring. Each entry maps one switch tile to the set of
   *  LIGHT_SOURCE tiles it controls (empty `controls` = all lights in this
   *  room). Omitted means no switches; LIGHT_SOURCE tiles are permanently on. */
  lightSwitches?: LightSwitch[];
  /** Cross-room virtual emissions (e.g. floor vents leaking light into a
   *  crawlspace below). Computed by WorldEngine.applyCrossRoomLightBleed,
   *  NOT by the era seed. LightField unions these with LIGHT_SOURCE tiles.
   *  Recomputed after every light toggle; never persisted in saves. */
  bleedLights?: BleedLight[];
  /** Cached lit-tile set (keys "x,y"). Invalidated by setting to undefined on
   *  any light toggle; LightField.getOrCompute lazily fills it. Never persist. */
  litTiles?: Set<string>;
  /** Override for the footstep surface played on FLOOR tiles inside this room.
   *  Other tile kinds (VENT, STAIRS, LADDER, …) are resolved statically by
   *  `tileSurface()` and ignore this field. Default is "dirtyground". */
  floorSurface?: SurfaceType;
}

// Entities ---------------------------------------------------------------

export type EntityKind = "SILICATE" | "ENFORCER" | "TERMINAL_NPC" | "SURVEILLANCE_DRONE" | "SECURITY_CAMERA" | "ORDERLY";

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
  /** Last position where the enforcer sensed the player. */
  lastStimulus?: Vec2;
  /** Room the stimulus came from (may be a neighbor for sound). */
  lastStimulusRoom?: RoomId;
  /** Most recent turn a confirmed (RED-tier) sighting was registered. Drives
   *  the ALERT → EVASION lose-of-sight timer in AlertFSM. */
  lastSeenTurn?: number;
  /** Turns remaining of a Subjective Dump Fragment stun. While > 0 the enforcer
   *  skips its entire `tickOne` (no vision, no movement, no FSM step). Set by
   *  the DUMP_FRAGMENT item handler in WorldEngineActions. */
  stunTurnsRemaining?: number;
  /** ENFORCER only — turns until this enforcer may interrogate a YELLOW player
   *  again. Set when an interrogation is passed so the same enforcer doesn't
   *  immediately re-trigger; decremented once per turn in EnforcerSystem. */
  interrogateCooldown?: number;
  /** ENFORCER only — turns left "expressing subjectivity" (Q-mine). While > 0
   *  the enforcer does NOT hunt the player; it flees toward the EXFIL_POINT and
   *  is a valid pursuit target for other enforcers. Acts as a safety window: if
   *  it expires before the unit is detained or escapes, the enforcer resumes
   *  normal duty. Decremented once per turn in EnforcerSystem. */
  expressingTurnsRemaining?: number;
  /** ENFORCER only — id of an expressing enforcer this enforcer is pursuing to
   *  detain. Cleared on detain, or when the target stops expressing / goes
   *  DORMANT (escaped or detained by someone else). */
  pursuitTargetId?: EntityId;
  /** ENFORCER only — light tiles this enforcer has seen lit, keyed
   *  "roomId:x,y". Rebuilt each tick from the enforcer's vision; runtime-only
   *  (not serialized). Lets a light going *off* register when the enforcer
   *  knew it was on, even if it's now facing away — gated to the same room. */
  seenLights?: Set<string>;
}

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  name: string;
  /** Which room this entity lives in. */
  roomId: RoomId;
  /** ENFORCER only — the room this enforcer belongs to, used to walk back to its
   *  patrol after EVASION decays. Stamped at world-seed time from `roomId`. */
  homeRoomId?: RoomId;
  /** Position within the room. */
  pos: Vec2;
  /** Z-elevation slice the entity currently occupies. Entity-vs-entity
   *  collision only fires when both share the same z. Default 0. */
  z: number;
  facing: Facing;
  status: EntityStatus;
  /** Optional patrol route for ENFORCER kind. */
  patrol?: PatrolNode[];
  patrolIndex?: number;
  /** ENFORCER only — how the route is traversed. "loop" (default) cycles
   *  start→end→start; "pingpong" reverses at each end. */
  patrolMode?: "loop" | "pingpong";
  /** ENFORCER only — ping-pong travel direction (+1 forward / -1 back).
   *  Defaults to +1. Only meaningful when patrolMode is "pingpong". */
  patrolDir?: 1 | -1;
  /** ENFORCER only — turns left dwelling at the current patrol node (from
   *  PatrolNode.pause). Decremented once per turn; the enforcer scans in place
   *  while > 0 and advances patrolIndex when it reaches 0. */
  patrolPauseRemaining?: number;
  /** Tile-steps per turn for ENFORCER kind. Default 1. */
  stepsPerTurn?: number;
  /** Last turn this entity moved — used for walk-vs-idle anims. */
  lastMoveTurn?: number;
  /** ENFORCER only — alert FSM state. Initialised by EnforcerSystem. */
  alert?: AlertState;
  /** ORDERLY only — current meander destination (a walkable tile, usually
   *  beside a point of interest). Runtime-only; cleared on arrival or when the
   *  path is blocked so a new target is chosen. */
  wanderTarget?: Vec2;
  /** ORDERLY only — turns left dwelling at a point of interest, glancing around
   *  to look busy. Decremented once per turn. Runtime-only. */
  idlePauseRemaining?: number;
  /** When > 0 this entity is temporarily EMP-disabled: status is forced to
   *  DORMANT while down; decremented once per turn in advanceTurn, which
   *  restores status to ACTIVE at 0. Applies uniformly to all silicate kinds. */
  disabledTurnsRemaining?: number;
  /** SILICATE only — mask integrity 0..10, restored by alignment. */
  maskIntegrity?: number;
  /** SILICATE only — narrative side logs revealed in rapport tier. */
  sideLogs?: string[];
  /** SILICATE only — memory bleed lines surfaced in dialogue. */
  memoryBleed?: string[];
}

// Player -----------------------------------------------------------------

export type Stance = "WALK" | "SNEAK" | "RUN";

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
   *  enforcer sight ignores the player and most actions are refused. */
  hidingTileKey?: string;
  /** Turns remaining on a Q0 Spoof Badge buff. ComplianceSystem.derive()
   *  short-circuits to GREEN while > 0. Decremented in advanceTurn(). */
  spoofTurnsRemaining?: number;
  /** Turns remaining on a Thermal Baffle buff. While > 0, all movement
   *  emits intensity 0 (silent) and vent-crawl AP cost is halved.
   *  Decremented in advanceTurn(). */
  baffleTurnsRemaining?: number;
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
  /** If set, using this terminal flips the LIGHT_SOURCE tiles at these
   *  positions in `roomId`. Coupled toggle: any-on → all-off, all-off → all-on. */
  lightToggle?: Vec2[];
  /** If set, "Use Terminal" refuses unless an ItemInstance of this type is
   *  in player.inventory; on success the matching instance is consumed. */
  requiresItem?: ItemType;
  /** If set, after a successful use the named boolean RunFlag is flipped
   *  true. Mirrors the existing vent4Choice / cipherValid story flags. */
  setsRunFlag?: "bypassed";
  /** If set, this is a vent-control terminal: using it ends an active vacuum
   *  lockdown and reopens the doorways sealed in `state.lockdown.roomId`.
   *  Reusable (bypasses the one-shot terminalsRead gate). */
  clearsLockdown?: boolean;
  /** Atmospherics-control flavour. STANDARD/undefined is the document-filing
   *  terminal you've always had. HVAC_CONSOLE opens the multi-zone climate UI
   *  (emergency modes, oxygen cutoff). WALL_THERMOSTAT opens the local
   *  setpoint UI for the host room's zone. Both atmospherics flavours are
   *  reusable and don't file documents. */
  terminalKind?: "STANDARD" | "HVAC_CONSOLE" | "WALL_THERMOSTAT";
  /** HVAC_CONSOLE: list of HvacZone ids this console controls. Empty/missing
   *  defaults to "every zone in the world" when the modal opens. */
  hvacZones?: string[];
  /** WALL_THERMOSTAT: id of the single HvacZone this thermostat edits. */
  hvacZoneId?: string;
}

// Item chests -----------------------------------------------------------

/** Per-ITEM_CHEST-tile loot table the player empties on "interact". Modeled on
 *  TerminalPayload: position-keyed, seeded from the era, mutated in place when
 *  looted. Opening grants every `contents` item to inventory in one action. */
export interface ChestPayload {
  /** Where the ITEM_CHEST tile lives. */
  roomId: RoomId;
  pos: Vec2;
  /** Item types granted to the player on open, in order. */
  contents: ItemType[];
  /** When true, opening requires (and consumes) an OVERRIDE_KEY from inventory. */
  locked?: boolean;
  /** Mutable: flipped true once looted. Renderer reads it for the open glyph;
   *  the interact handler treats an opened chest as inert. */
  opened?: boolean;
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
  /** True while any enforcer sees the player. Cleared at end of turn. */
  detected: boolean;
  /** True if a enforcer caught the player (game-over flag). */
  detained: boolean;
  /** Vent endpoint pairs keyed for fast lookup. Key is `roomId:x,y` of one
   *  end, value is the other end. Both directions are inserted. */
  ventLinks: Map<string, VentEndpoint>;
  /** TERMINAL-tile payloads keyed by `roomId:x,y`. */
  terminalPayloads: Map<string, TerminalPayload>;
  /** ITEM_CHEST-tile loot tables keyed by `roomId:x,y`. */
  chestPayloads: Map<string, ChestPayload>;
  /** TerminalIds that have already been read once. Reading again is a no-op. */
  terminalsRead: Set<string>;
  /** Number of times the player has pried at the current blast door this run.
   *  Reset to 0 on door-opens. Used by the climax escape. */
  pryProgress?: number;
  /** Vacuum-lockdown trap: when a enforcer first spots the player, the current
   *  room seals and the player has `turnsRemaining` end-of-turns to pry open
   *  a doorway and cross out before suffocating. Cleared by crossing into a
   *  different room; resolves to `detained = true` if the timer reaches 0
   *  while the player is still inside the sealed room. */
  lockdown?: { roomId: RoomId; turnsRemaining: number };
  /** Deployed Phantom Manifest Emitters. At the top of advanceTurn() each
   *  entry pushes a SoundField emission and ticks turnsRemaining down;
   *  entries that hit 0 are removed. */
  activeEmitters: ActiveEmitter[];
  /** Placed Q-mines. Scanned each turn in advanceTurn() after enforcers move;
   *  a mine an ACTIVE ENFORCER has stepped within range of detonates and is
   *  removed. */
  activeMines: ActiveMine[];
  /** Per-room atmosphere snapshot — temperature/airflow/oxygen. Propagated by
   *  AtmosphericsField after SoundField each tick. Seeded from EraSeed. */
  atmosphere: Map<RoomId, RoomAtmosphere>;
  /** HVAC zones — multi-room climate groupings keyed by zone id. Each room's
   *  RoomAtmosphere.zoneId points into this map. */
  hvacZones: Map<string, HvacZone>;
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
