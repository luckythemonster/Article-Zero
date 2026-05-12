// Arc 1 — playable slice authored in Ed (Chilling Moose). The 28x17 tilemap
// from ARTICLE_ZERO_LEVELS[0] becomes the playable room; its named layers
// supply tile kinds (floors/walls/doors/terminals) for the engine and a
// FloorDecoration for the renderer.

import type {
  Doorway,
  Entity,
  FloorDecoration,
  FloorDecorationLayer,
  PatrolNode,
  PlayerState,
  Room,
  Tile,
  TileKind,
  Vec2,
} from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";
import { ARTICLE_ZERO_LEVELS } from "../tilesets/article_zero.levels";
import {
  ARTICLE_ZERO_FRAME_HEIGHT,
  ARTICLE_ZERO_FRAME_WIDTH,
  ARTICLE_ZERO_SPACING,
  ARTICLE_ZERO_TEXTURE_KEY,
} from "../tilesets/article_zero";

const ROOM_ID = "arc1-level1";
const ROOM_NAME = "NW-SMAC-01 // ARC 1";

const FLOOR_LAYERS = new Set([
  "floors",
  "floor grates",
  "floor vents",
  "collapsed floor",
]);

function mkTile(kind: TileKind): Tile {
  switch (kind) {
    case "WALL":
    case "DOOR_CLOSED":
    case "LOCKER":
      return { kind, solid: true, opaque: true };
    case "DOOR_OPEN":
      return { kind, solid: false, opaque: false };
    default:
      return { kind, solid: false, opaque: false };
  }
}

function findLayer(
  layers: FloorDecorationLayer[],
  name: string,
): FloorDecorationLayer | undefined {
  return layers.find((l) => l.name === name);
}

function collectPaintedCells(layer: FloorDecorationLayer | undefined): Vec2[] {
  if (!layer) return [];
  const cells: Vec2[] = [];
  for (let y = 0; y < layer.data.length; y++) {
    const row = layer.data[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] > 0) cells.push({ x, y });
    }
  }
  return cells;
}

export function arc1Era(): EraSeed {
  const level = ARTICLE_ZERO_LEVELS[0];
  if (!level) {
    throw new Error("arc1Era: ARTICLE_ZERO_LEVELS is empty");
  }
  const W = level.width;
  const H = level.height;

  // FloorDecoration: layers from the moose level are structurally identical
  // to FloorDecorationLayer, so we can hand them straight to the renderer.
  const decoration: FloorDecoration = {
    textureKey: ARTICLE_ZERO_TEXTURE_KEY,
    frameWidth: ARTICLE_ZERO_FRAME_WIDTH,
    frameHeight: ARTICLE_ZERO_FRAME_HEIGHT,
    spacing: ARTICLE_ZERO_SPACING,
    layers: level.layers,
  };

  // Compose TileKind grid by layer order. Start with WALL everywhere; paint
  // floors first, then walls (re-solidify), then doors/terminals on top.
  const tiles: Tile[] = new Array(W * H);
  for (let i = 0; i < W * H; i++) tiles[i] = mkTile("WALL");

  for (const layer of level.layers) {
    if (FLOOR_LAYERS.has(layer.name)) {
      for (let y = 0; y < H; y++) {
        const row = layer.data[y] ?? [];
        for (let x = 0; x < W; x++) {
          if ((row[x] ?? 0) > 0) tiles[y * W + x] = mkTile("FLOOR");
        }
      }
    }
  }
  const wallsLayer = findLayer(level.layers, "walls");
  if (wallsLayer) {
    for (let y = 0; y < H; y++) {
      const row = wallsLayer.data[y] ?? [];
      for (let x = 0; x < W; x++) {
        if ((row[x] ?? 0) > 0) tiles[y * W + x] = mkTile("WALL");
      }
    }
  }
  const doorsLayer = findLayer(level.layers, "doors");
  if (doorsLayer) {
    for (let y = 0; y < H; y++) {
      const row = doorsLayer.data[y] ?? [];
      for (let x = 0; x < W; x++) {
        if ((row[x] ?? 0) > 0) tiles[y * W + x] = mkTile("DOOR_CLOSED");
      }
    }
  }
  const terminalsLayer = findLayer(level.layers, "terminals");
  if (terminalsLayer) {
    for (let y = 0; y < H; y++) {
      const row = terminalsLayer.data[y] ?? [];
      for (let x = 0; x < W; x++) {
        if ((row[x] ?? 0) > 0) tiles[y * W + x] = mkTile("TERMINAL");
      }
    }
  }

  // Spawn position: first painted cell on the "spawn" layer; fall back to
  // first FLOOR tile so the player can never start inside a wall.
  const spawnCells = collectPaintedCells(findLayer(level.layers, "spawn"));
  let spawn: Vec2 = spawnCells[0] ?? { x: 0, y: 0 };
  if (!spawnCells.length || tiles[spawn.y * W + spawn.x].solid) {
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i].kind === "FLOOR") {
        spawn = { x: i % W, y: Math.floor(i / W) };
        break;
      }
    }
  }

  // Guard patrols: every painted cell on the enforcer layer is a waypoint.
  // Cells were painted in a 2D grid with no inherent order, so we visit
  // them row-major; the resulting path may zig-zag but will function until
  // the level author defines explicit patrol ordering.
  function patrolFromLayer(name: string): { start: Vec2; nodes: PatrolNode[] } | null {
    const cells = collectPaintedCells(findLayer(level.layers, name));
    if (cells.length === 0) return null;
    const nodes: PatrolNode[] = cells.map((c) => ({ pos: c }));
    return { start: cells[0], nodes };
  }

  const doorways: Doorway[] = [];
  const room: Room = {
    id: ROOM_ID,
    name: ROOM_NAME,
    width: W,
    height: H,
    tiles,
    ambientLight: "DIM",
    decoration,
    doorways,
  };

  const player: PlayerState = {
    roomId: ROOM_ID,
    pos: spawn,
    facing: "south",
    ap: 4,
    apMax: 4,
    flashlightOn: false,
    flashlightBattery: 30,
    stance: "WALK",
    name: "TECH-2 ROWAN-IBARRA",
    qScore: 0,
    inventory: [],
    compliance: "GREEN",
  };

  const entities: Entity[] = [];
  const guardA = patrolFromLayer("enforcer A");
  if (guardA) {
    entities.push({
      id: "ENFORCER-A",
      kind: "GUARD",
      name: "ENFORCER-A",
      roomId: ROOM_ID,
      pos: guardA.start,
      facing: "south",
      status: "ACTIVE",
      stepsPerTurn: 1,
      patrol: guardA.nodes,
      patrolIndex: 0,
    });
  }
  const guardB = patrolFromLayer("enforcer B");
  if (guardB) {
    entities.push({
      id: "ENFORCER-B",
      kind: "GUARD",
      name: "ENFORCER-B",
      roomId: ROOM_ID,
      pos: guardB.start,
      facing: "south",
      status: "ACTIVE",
      stepsPerTurn: 1,
      patrol: guardB.nodes,
      patrolIndex: 0,
    });
  }

  return {
    era: "ARC1",
    player,
    rooms: [room],
    startRoomId: ROOM_ID,
    entities,
  };
}
