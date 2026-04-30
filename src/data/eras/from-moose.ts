// from-moose.ts — convert an Ed-authored MooseLevel into an EraSeed-friendly
// floor description. Layer names map to gameplay tile semantics; everything
// else is treated as pure decoration. See art/README.md for the convention.

import type {
  AmbientLightLevel,
  Era,
  Entity,
  Floor,
  FloorDecoration,
  ItemInstance,
  PlayerState,
  Tile,
  TileKind,
} from "../../types/world.types";
import type { MooseLayer, MooseLevel } from "../tilesets/types";
import type { EraSeed } from "../../engine/WorldEngineState";

// Lower index = applied first; later semantic layers win on conflict.
// `chasm` / `void` / `pit` paint first so a floor / walls / doors layer on
// top can override them — only unpainted floor cells over chasm stay
// CHASM in the gameplay grid (impassable but transparent so FOV passes
// across to the far side of a hole).
const SEMANTIC_LAYERS: { name: string; kind: Exclude<TileKind, "DOOR_OPEN"> }[] = [
  { name: "chasm",         kind: "CHASM" },
  { name: "void",          kind: "CHASM" },
  { name: "pit",           kind: "CHASM" },
  { name: "floor",         kind: "FLOOR" },
  { name: "walls",         kind: "WALL" },
  { name: "doors",         kind: "DOOR_CLOSED" },
  { name: "terminals",     kind: "TERMINAL" },
  { name: "vent_control",  kind: "VENT_CONTROL" },
  { name: "shared_field",  kind: "SHARED_FIELD_RIG" },
  { name: "light_sources", kind: "LIGHT_SOURCE" },
  { name: "article_zero",  kind: "ARTICLE_ZERO_FRAGMENT_TILE" },
  { name: "lattice_exit",  kind: "LATTICE_EXIT" },
];

const SPAWN_LAYER_NAME = "spawn";

// Render-order priority by layer name. Lower = drawn first (bottom).
// Lets the importer be lazy about Ed's board ordering — what matters is the
// name. Known back-layer names (chasm / void / pit / shadows) sort below
// the floor; the floor sits below structural layers (walls, doors); pure-
// decoration / FX names sort on top.
const RENDER_PRIORITY: Record<string, number> = {
  chasm: 10,
  void: 10,
  pit: 10,
  shadows: 20,
  floor: 40,
  doors: 60,
  walls: 70,
  terminals: 80,
  vent_control: 80,
  shared_field: 80,
  light_sources: 80,
  article_zero: 80,
  lattice_exit: 80,
  objects: 90,
};

function renderPriority(name: string): number {
  return RENDER_PRIORITY[name.toLowerCase()] ?? 50;
}

function makeTile(kind: TileKind): Tile {
  if (kind === "WALL") return { kind, solid: true, opaque: true };
  if (kind === "DOOR_CLOSED") return { kind, solid: true, opaque: true };
  // CHASM: you can't walk into the hole, but you can see across it.
  if (kind === "CHASM") return { kind, solid: true, opaque: false };
  return { kind, solid: false, opaque: false };
}

function findLayer(level: MooseLevel, name: string): MooseLayer | undefined {
  return level.layers.find((l) => l.name.toLowerCase() === name);
}

interface SeedOptions {
  era: Era;
  floorIndex?: number;
  floorName?: string;
  ambientLight?: AmbientLightLevel;
  textureKey: string;
  player: Omit<PlayerState, "pos" | "facing"> & { facing?: PlayerState["facing"] };
  entities?: Entity[];
  startingItems?: ItemInstance[];
  /** Override spawn position; otherwise resolved from the `spawn` layer or
   *  defaults to the floor centre. */
  spawnOverride?: { x: number; y: number };
}

export function eraSeedFromMooseLevel(
  level: MooseLevel,
  options: SeedOptions,
): EraSeed {
  const { width, height } = level;
  const tiles: Tile[] = new Array(width * height);
  // Default empty cells to WALL — keeps the player from walking off the map
  // even if the author forgot to draw a floor.
  for (let i = 0; i < tiles.length; i++) tiles[i] = makeTile("WALL");

  // Apply semantic layers in declared order; later ones override.
  for (const { name, kind } of SEMANTIC_LAYERS) {
    const layer = findLayer(level, name);
    if (!layer) continue;
    for (let y = 0; y < height; y++) {
      const row = layer.data[y] ?? [];
      for (let x = 0; x < width; x++) {
        if ((row[x] ?? 0) !== 0) tiles[y * width + x] = makeTile(kind);
      }
    }
  }

  // Resolve spawn — preference order:
  //   1) explicit options.spawnOverride
  //   2) first non-zero cell in a layer named `spawn`
  //   3) first walkable (non-solid) tile in row-major order
  //   4) map centre
  // The walkable-cell fallback matters when the author forgot to paint a
  // spawn tile but did paint a floor — without it Sol could land inside a
  // wall and be unable to move.
  let spawn = options.spawnOverride ?? null;
  if (!spawn) {
    const spawnLayer = findLayer(level, SPAWN_LAYER_NAME);
    if (spawnLayer) {
      outer:
      for (let y = 0; y < height; y++) {
        const row = spawnLayer.data[y] ?? [];
        for (let x = 0; x < width; x++) {
          if ((row[x] ?? 0) !== 0) { spawn = { x, y }; break outer; }
        }
      }
    }
  }
  if (!spawn) {
    walkable:
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = tiles[y * width + x];
        if (t && !t.solid) { spawn = { x, y }; break walkable; }
      }
    }
  }
  if (!spawn) spawn = { x: Math.floor(width / 2), y: Math.floor(height / 2) };

  // Decoration: every layer except the SPAWN sentinel goes to the renderer.
  // Pure-decoration layers default opacity 0.45 for `shadows`, 1 otherwise
  // unless the author overrode it in Ed.
  // Sort decoration layers back-to-front by name-based priority so the
  // chasm / void / shadows render below the floor, walls and doors render
  // above the floor, and pure-decoration / FX layers render on top —
  // regardless of whatever order Ed exported the boards in.
  const decoLayers = level.layers
    .filter((l) => l.name.toLowerCase() !== SPAWN_LAYER_NAME)
    .map((l, originalIdx) => ({
      name: l.name,
      opacity:
        l.opacity ??
        (l.name.toLowerCase() === "shadows" ? 0.45 : 1),
      data: l.data,
      originalIdx,
    }))
    .sort((a, b) => {
      const pa = renderPriority(a.name);
      const pb = renderPriority(b.name);
      if (pa !== pb) return pa - pb;
      return a.originalIdx - b.originalIdx;
    })
    .map(({ name, opacity, data }) => ({ name, opacity, data }));

  const decoration: FloorDecoration = {
    textureKey: options.textureKey,
    // Levels-mode decoration assumes square tiles authored at level.tileSize.
    // Multi-height frames are wired by hand in the era seed (see Floor.decoration).
    frameWidth: level.tileSize,
    frameHeight: level.tileSize,
    spacing: level.spacing,
    layers: decoLayers,
  };

  const z = options.floorIndex ?? 1;
  const floor: Floor = {
    z,
    width,
    height,
    name: options.floorName ?? level.name,
    tiles,
    ambientLight: options.ambientLight ?? "DIM",
    decoration,
  };

  const player: PlayerState = {
    ...options.player,
    pos: { x: spawn.x, y: spawn.y, z },
    facing: options.player.facing ?? "south",
  };

  return {
    era: options.era,
    player,
    floors: [floor],
    entities: (options.entities ?? []).map((e) => ({ ...e, pos: { ...e.pos, z } })),
    startingItems: (options.startingItems ?? []).map((it) =>
      it.pos ? { ...it, pos: { ...it.pos, z } } : it,
    ),
  };
}

/** Convenience guard — pure-decoration layer name? Anything not in the
 *  semantic table or the spawn sentinel is treated as decoration. */
export function isPureDecorationLayer(name: string): boolean {
  const n = name.toLowerCase();
  if (n === SPAWN_LAYER_NAME) return false;
  return !SEMANTIC_LAYERS.some((s) => s.name === n);
}
