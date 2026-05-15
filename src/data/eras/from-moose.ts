// Moose → EraSeed loader.
//
// Compiles a `MooseLevel[]` (produced by `npm run moose`) plus a small TS
// companion `MooseEraMeta` into a runnable `EraSeed`. The Ed export carries
// painted tile/marker grids; the meta file carries everything Ed cannot
// paint (entity stats, patrols, terminal copy, doorway destinations,
// crawlspace flagging).
//
// Authoring contract: see /root/.claude/plans/tell-me-what-data-zazzy-glade.md
// (or the plan checked into the repo) for the layer-name table and meta
// shape. Highlights:
//   - Gameplay tile layers: floor / walls / doors_closed / doors_open /
//     terminals / extraction_terminal / exfil_point / light_sources / vent /
//     locker. Default unpainted cell is FLOOR.
//   - Marker layers: `spawn`, `entity:<id>`.
//   - Vents are NOT teleporters. A vent connection is two `kind: "vent"`
//     doorways framing a `crawlspace: true` Room.

import type {
  AmbientLightLevel,
  Doorway,
  Entity,
  EntityId,
  EntityKind,
  Era,
  Facing,
  FloorDecoration,
  FloorDecorationLayer,
  PatrolNode,
  PlayerState,
  Room,
  RoomId,
  Side,
  TerminalPayload,
  Tile,
  TileKind,
  Vec2,
} from "../../types/world.types";
import { oppositeSide } from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";
import type { MooseLayer, MooseLevel } from "../tilesets/types";
import { mkTile } from "./tile-factory";

// ---------- Meta-file shape ------------------------------------------------

export interface MooseRoomMeta {
  /** Match either by Ed level name (preferred) or by zero-based index. */
  levelName?: string;
  levelIndex?: number;
  id: RoomId;
  displayName: string;
  ambient: AmbientLightLevel;
  /** Crawlspace flag — reachable only via `kind: "vent"` doorways. */
  crawlspace?: boolean;
  /** When set, only Ed layers whose name begins with this prefix (matched
   *  case-insensitively against the raw layer name) are consumed by this
   *  room; the prefix is stripped before semantic-name lookup. Lets a
   *  single Ed level produce multiple Rooms by board-name scope (e.g.
   *  `level -1 ` for a sub-deck, `vent ` for a crawlspace network). */
  boardPrefix?: string;
}

export interface MoosePlayerMeta {
  name: string;
  apMax?: number;
  flashlightBattery?: number;
  facing?: Facing;
}

export interface MooseDoorwayMeta {
  from: RoomId;
  to: RoomId;
  side: Side;
  localPos: Vec2;
  landingPos: Vec2;
  closed?: boolean;
  kind?: "vent" | "ladder";
}

export interface MooseEntityMeta {
  id: EntityId;
  kind: EntityKind;
  name: string;
  facing: Facing;
  /** GUARD only. */
  patrol?: PatrolNode[];
  stepsPerTurn?: number;
  /** SILICATE only. */
  maskIntegrity?: number;
  sideLogs?: string[];
  memoryBleed?: string[];
}

export interface MooseTerminalMeta extends TerminalPayload {}

export interface MooseEraMeta {
  era: Era;
  /** Phaser texture key the renderer uses for `Room.decoration`. Must match
   *  the generated `<slug>.ts` tileset module. */
  tilesetKey: string;
  /** Tileset frame dimensions — must match the `npm run moose` output for
   *  `tilesetKey` (see `MooseTilesetEntry.frameWidth/height/spacing`). */
  frameWidth: number;
  frameHeight: number;
  spacing: number;
  rooms: MooseRoomMeta[];
  startRoomId: RoomId;
  player: MoosePlayerMeta;
  doorways: MooseDoorwayMeta[];
  entities: MooseEntityMeta[];
  terminals?: MooseTerminalMeta[];
}

// ---------- Layer-name → semantics ----------------------------------------

const TILE_KIND_LAYERS: Record<string, TileKind> = {
  floor: "FLOOR",
  floors: "FLOOR",
  walls: "WALL",
  wall: "WALL",
  doors_closed: "DOOR_CLOSED",
  doors_open: "DOOR_OPEN",
  doors: "DOOR_CLOSED",
  door: "DOOR_CLOSED",
  terminals: "TERMINAL",
  terminal: "TERMINAL",
  extraction_terminal: "EXTRACTION_TERMINAL",
  exfil_point: "EXFIL_POINT",
  exfil: "EXFIL_POINT",
  light_sources: "LIGHT_SOURCE",
  light_source: "LIGHT_SOURCE",
  vent: "VENT",
  vents: "VENT",
  vent_control: "VENT",
  locker: "LOCKER",
  lockers: "LOCKER",
  chasm: "CHASM",
  ladder: "LADDER",
  ladders: "LADDER",
  // `shaft` is the navigable interior of a vent crawlspace (`vent shaft 0`
  // boards). After the "vent " room prefix is stripped these layers
  // normalise to "shaft" — treat them as FLOOR so the negative space of
  // `vent walls 0` is walkable.
  shaft: "FLOOR",
};

// Layer names recognised as pure-decoration backdrop on this map but whose
// frames live on spritesheets the importer doesn't load (v1.5 reads only
// sheet 0). Their painted handles resolve to unrelated frame indices and
// would paint visual junk — skip them in decoration assembly.
const DECORATION_SKIP_LAYERS: Set<string> = new Set([
  "station_hull",
  "asteroid",
  "star_bg",
]);

// Per-layer precedence override. Lets a specific layer outrank its tile
// kind's nominal score. Reserved for cases where authoring convention
// disagrees with the kind's default rank.
const LAYER_PRECEDENCE_OVERRIDE: Record<string, number> = {};

// Higher number wins when two layers paint the same cell. Tuned so that
// walls always defeat floor underneath, doors defeat walls, lockers defeat
// floor, and interactables (terminals/vents/light/exfil) sit above floor.
const TILE_KIND_PRECEDENCE: Record<TileKind, number> = {
  // FLOOR and CHASM share the base layer: in Ed/Moose authoring, `chasm`
  // is painted as a sub-deck-visible backdrop everywhere a hole might be,
  // then `floor` is overlaid on the walkable spots. Ties resolve to the
  // earlier-iterated layer, and `floor` boards are conventionally painted
  // before `chasm` — so chasm only "wins" on cells the floor leaves bare.
  FLOOR: 0,
  CHASM: 0,
  LIGHT_SOURCE: 1,
  EXFIL_POINT: 1,
  TERMINAL: 1,
  EXTRACTION_TERMINAL: 1,
  VENT: 1,
  LOCKER: 2,
  DOOR_OPEN: 3,
  DOOR_CLOSED: 3,
  WALL: 4,
  // Ladders are painted on a wall face by convention — they MUST beat
  // walls so the climb cell isn't blocked by surrounding wall paint.
  LADDER: 5,
};

function normalizeLayerName(name: string): string {
  // Strip a trailing " <digits>" Ed-Board suffix (`floor 0` → `floor`,
  // `vents 0` → `vents`) before whitespace collapse — Ed authors layers
  // with these numeric suffixes by convention, but they carry no gameplay
  // meaning.
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+\d+$/, "")
    .replace(/[\s-]+/g, "_");
}

function isEntityMarker(name: string): string | null {
  const n = normalizeLayerName(name);
  if (n.startsWith("entity:")) return n.slice("entity:".length);
  return null;
}

function isSpawnMarker(name: string): boolean {
  return normalizeLayerName(name) === "spawn";
}

// ---------- Marker collection ---------------------------------------------

interface MarkerPositions {
  spawn?: Vec2;
  entities: Map<string, Vec2>; // key is normalized entity id
}

function firstPainted(layer: MooseLayer): Vec2 | undefined {
  for (let y = 0; y < layer.data.length; y++) {
    const row = layer.data[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 0) return { x, y };
    }
  }
  return undefined;
}

function collectMarkers(level: MooseLevel): MarkerPositions {
  const out: MarkerPositions = { entities: new Map() };
  for (const layer of level.layers) {
    if (isSpawnMarker(layer.name)) {
      const p = firstPainted(layer);
      if (p) out.spawn = p;
      continue;
    }
    const eid = isEntityMarker(layer.name);
    if (eid) {
      const p = firstPainted(layer);
      if (p) out.entities.set(eid, p);
    }
  }
  return out;
}

// ---------- Tile assembly -------------------------------------------------

function tileLayersFor(
  level: MooseLevel,
): Array<{ kind: TileKind; score: number; layer: MooseLayer }> {
  const out: Array<{ kind: TileKind; score: number; layer: MooseLayer }> = [];
  for (const layer of level.layers) {
    const n = normalizeLayerName(layer.name);
    const kind = TILE_KIND_LAYERS[n];
    if (!kind) continue;
    const score = LAYER_PRECEDENCE_OVERRIDE[n] ?? TILE_KIND_PRECEDENCE[kind];
    out.push({ kind, score, layer });
  }
  return out;
}

function decorationLayersFor(level: MooseLevel): MooseLayer[] {
  const out: MooseLayer[] = [];
  for (const layer of level.layers) {
    const n = normalizeLayerName(layer.name);
    if (TILE_KIND_LAYERS[n]) continue;
    if (n === "spawn") continue;
    if (n.startsWith("entity:")) continue;
    if (DECORATION_SKIP_LAYERS.has(n)) continue;
    out.push(layer);
  }
  return out;
}

function buildTiles(level: MooseLevel): Tile[] {
  const { width, height } = level;
  const tiles: Tile[] = new Array(width * height);
  const winnerKind: TileKind[] = new Array(width * height).fill("FLOOR");
  const winnerScore: number[] = new Array(width * height).fill(-1);

  for (const { kind, score, layer } of tileLayersFor(level)) {
    for (let y = 0; y < Math.min(layer.data.length, height); y++) {
      const row = layer.data[y];
      for (let x = 0; x < Math.min(row.length, width); x++) {
        if (row[x] === 0) continue;
        const idx = y * width + x;
        if (score > winnerScore[idx]) {
          winnerScore[idx] = score;
          winnerKind[idx] = kind;
        }
      }
    }
  }

  for (let i = 0; i < tiles.length; i++) {
    tiles[i] = mkTile(winnerKind[i]);
  }
  return tiles;
}

function buildDecoration(level: MooseLevel, meta: MooseEraMeta): FloorDecoration | undefined {
  const layers = decorationLayersFor(level);
  if (layers.length === 0) return undefined;
  const decLayers: FloorDecorationLayer[] = layers.map((l) => ({
    name: l.name,
    opacity: l.opacity,
    data: l.data,
  }));
  return {
    textureKey: meta.tilesetKey,
    frameWidth: meta.frameWidth,
    frameHeight: meta.frameHeight,
    spacing: meta.spacing,
    layers: decLayers,
  };
}

// ---------- Level resolution ----------------------------------------------

function resolveLevel(levels: MooseLevel[], roomMeta: MooseRoomMeta): MooseLevel {
  if (roomMeta.levelIndex != null) {
    const lvl = levels[roomMeta.levelIndex];
    if (!lvl) throw new Error(`from-moose: levelIndex ${roomMeta.levelIndex} out of range for room "${roomMeta.id}"`);
    return lvl;
  }
  if (roomMeta.levelName) {
    const lvl = levels.find((l) => l.name === roomMeta.levelName);
    if (!lvl) throw new Error(`from-moose: no Ed level named "${roomMeta.levelName}" (room id "${roomMeta.id}")`);
    return lvl;
  }
  throw new Error(`from-moose: room "${roomMeta.id}" needs levelName or levelIndex`);
}

// ---------- Doorway pairing -----------------------------------------------

function paintDoor(room: Room, pos: Vec2, kind: TileKind) {
  const idx = pos.y * room.width + pos.x;
  if (idx < 0 || idx >= room.tiles.length) return;
  room.tiles[idx] = mkTile(kind);
}

function emitDoorways(
  rooms: Map<RoomId, Room>,
  doors: MooseDoorwayMeta[],
): void {
  for (const d of doors) {
    const a = rooms.get(d.from);
    const b = rooms.get(d.to);
    if (!a) throw new Error(`from-moose: doorway from unknown room "${d.from}"`);
    if (!b) throw new Error(`from-moose: doorway to unknown room "${d.to}"`);

    const forward: Doorway = {
      from: d.from,
      to: d.to,
      side: d.side,
      localPos: d.localPos,
      landingPos: d.landingPos,
      closed: d.closed,
      kind: d.kind,
    };
    // The mirror lives in `to` and lands the player back at the source's
    // local door tile. The mirror's `localPos` is the tile on `to`'s edge
    // facing the source — we infer it from the `landingPos` by stepping one
    // tile back along the opposite side (e.g. a "to" room whose landingPos
    // is (1,4) on its W edge has its door tile at (0,4)).
    const mirrorSide = oppositeSide(d.side);
    // Edge-style doorways (no `kind`) sit on the room border; the mirror
    // lives at the destination's matching border edge. Internal-style
    // doorways (`kind: "vent" | "ladder"`) sit on an arbitrary interior
    // cell; the mirror lives at the cell the player landed on, so
    // re-entering it from any direction crosses back.
    const isInternal = d.kind === "vent" || d.kind === "ladder";
    const mirrorLocal = isInternal
      ? d.landingPos
      : stepFromLandingToEdge(b, d.landingPos, mirrorSide);
    const mirror: Doorway = {
      from: d.to,
      to: d.from,
      side: mirrorSide,
      localPos: mirrorLocal,
      landingPos: d.localPos,
      closed: d.closed,
      kind: d.kind,
    };
    a.doorways.push(forward);
    b.doorways.push(mirror);

    if (d.kind === "vent" || d.kind === "ladder") {
      // Vent: the non-crawlspace side's localPos is a painted VENT tile;
      // preserve it. The crawlspace side just gets the entry cell painted
      // by the meta-author. Ladder: both sides keep their painted LADDER
      // tiles (the doorway is the climb, not a door swap).
    } else if (d.closed) {
      paintDoor(a, forward.localPos, "DOOR_CLOSED");
      paintDoor(b, mirror.localPos, "DOOR_CLOSED");
    } else {
      paintDoor(a, forward.localPos, "DOOR_OPEN");
      paintDoor(b, mirror.localPos, "DOOR_OPEN");
    }
  }
}

// ---------- Board-prefix filter (multi-Room-per-Ed-level) -----------------

/** Derives a per-room MooseLevel view: drops layers that don't belong to
 *  this room and strips the matching prefix from layers that do. Lets one
 *  Ed level back several Rooms via board-name scope. */
function levelForRoom(
  level: MooseLevel,
  roomMeta: MooseRoomMeta,
  otherPrefixes: string[],
): MooseLevel {
  const ownPrefix = roomMeta.boardPrefix?.toLowerCase() ?? null;
  const filtered: MooseLayer[] = [];
  for (const layer of level.layers) {
    const rawLower = layer.name.toLowerCase();
    if (ownPrefix) {
      if (!rawLower.startsWith(ownPrefix)) continue;
      filtered.push({
        ...layer,
        name: layer.name.slice(ownPrefix.length),
      });
    } else {
      const stolen = otherPrefixes.some((p) => rawLower.startsWith(p));
      if (stolen) continue;
      filtered.push(layer);
    }
  }
  return { ...level, layers: filtered };
}

function stepFromLandingToEdge(room: Room, landing: Vec2, side: Side): Vec2 {
  switch (side) {
    case "N": return { x: landing.x, y: 0 };
    case "S": return { x: landing.x, y: room.height - 1 };
    case "W": return { x: 0, y: landing.y };
    case "E": return { x: room.width - 1, y: landing.y };
  }
}

// ---------- Public entry point --------------------------------------------

export function mooseToEraSeed(levels: MooseLevel[], meta: MooseEraMeta): EraSeed {
  if (!levels.length) throw new Error("from-moose: no Ed levels supplied");

  // Build rooms (tiles + decoration + crawlspace flag, no doorways yet).
  const roomsById = new Map<RoomId, Room>();
  const markersById = new Map<RoomId, MarkerPositions>();

  // Each prefixed room "claims" its layers; an un-prefixed room reads
  // everything else minus the claimed ones.
  const otherPrefixes = meta.rooms
    .map((r) => r.boardPrefix?.toLowerCase())
    .filter((p): p is string => !!p);

  for (const rm of meta.rooms) {
    const sourceLevel = resolveLevel(levels, rm);
    const ownOthers = otherPrefixes.filter(
      (p) => p !== rm.boardPrefix?.toLowerCase(),
    );
    const level = levelForRoom(sourceLevel, rm, ownOthers);
    const tiles = buildTiles(level);
    const decoration = buildDecoration(level, meta);
    const room: Room = {
      id: rm.id,
      name: rm.displayName,
      width: level.width,
      height: level.height,
      tiles,
      ambientLight: rm.ambient,
      doorways: [],
      ...(decoration ? { decoration } : {}),
      ...(rm.crawlspace ? { crawlspace: true } : {}),
    };
    roomsById.set(rm.id, room);
    markersById.set(rm.id, collectMarkers(level));
  }

  // Wire up doorways with mirroring.
  emitDoorways(roomsById, meta.doorways);

  // Build entities by pairing meta records with their entity:<id> markers.
  const entities: Entity[] = [];
  for (const em of meta.entities) {
    let placed: { roomId: RoomId; pos: Vec2 } | undefined;
    const key = em.id.toLowerCase();
    for (const [roomId, markers] of markersById) {
      const pos = markers.entities.get(key);
      if (pos) { placed = { roomId, pos }; break; }
    }
    if (!placed) {
      throw new Error(`from-moose: no "entity:${em.id}" marker layer found in any room`);
    }
    const ent: Entity = {
      id: em.id,
      kind: em.kind,
      name: em.name,
      roomId: placed.roomId,
      pos: placed.pos,
      facing: em.facing,
      status: "ACTIVE",
      ...(em.patrol ? { patrol: em.patrol, patrolIndex: 0 } : {}),
      ...(em.stepsPerTurn != null ? { stepsPerTurn: em.stepsPerTurn } : {}),
      ...(em.maskIntegrity != null ? { maskIntegrity: em.maskIntegrity } : {}),
      ...(em.sideLogs ? { sideLogs: em.sideLogs } : {}),
      ...(em.memoryBleed ? { memoryBleed: em.memoryBleed } : {}),
    };
    entities.push(ent);
  }

  // Player spawn from the start room.
  const startMarkers = markersById.get(meta.startRoomId);
  if (!startMarkers) throw new Error(`from-moose: startRoomId "${meta.startRoomId}" not found in rooms`);
  if (!startMarkers.spawn) {
    throw new Error(`from-moose: start room "${meta.startRoomId}" has no "spawn" marker layer`);
  }
  const player: PlayerState = {
    roomId: meta.startRoomId,
    pos: startMarkers.spawn,
    facing: meta.player.facing ?? "south",
    ap: meta.player.apMax ?? 4,
    apMax: meta.player.apMax ?? 4,
    flashlightOn: false,
    flashlightBattery: meta.player.flashlightBattery ?? 30,
    stance: "WALK",
    name: meta.player.name,
    qScore: 0,
    inventory: [],
    compliance: "GREEN",
  };

  return {
    era: meta.era,
    player,
    rooms: Array.from(roomsById.values()),
    startRoomId: meta.startRoomId,
    entities,
    terminals: meta.terminals,
  };
}
