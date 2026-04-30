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
const SEMANTIC_LAYERS: { name: string; kind: Exclude<TileKind, "FLOOR" | "DOOR_OPEN"> | "FLOOR" }[] = [
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

const PURE_DECORATION_NAMES = new Set(["objects", "shadows"]);
const SPAWN_LAYER_NAME = "spawn";

function makeTile(kind: TileKind): Tile {
  if (kind === "WALL") return { kind, solid: true, opaque: true };
  if (kind === "DOOR_CLOSED") return { kind, solid: true, opaque: true };
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

  // Resolve spawn
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
  if (!spawn) spawn = { x: Math.floor(width / 2), y: Math.floor(height / 2) };

  // Decoration: every layer except the SPAWN sentinel goes to the renderer.
  // Pure-decoration layers default opacity 0.45 for `shadows`, 1 otherwise
  // unless the author overrode it in Ed.
  const decoration: FloorDecoration = {
    textureKey: options.textureKey,
    // Levels-mode decoration assumes square tiles authored at level.tileSize.
    // Multi-height frames are wired by hand in the era seed (see Floor.decoration).
    frameWidth: level.tileSize,
    frameHeight: level.tileSize,
    spacing: level.spacing,
    layers: level.layers
      .filter((l) => l.name.toLowerCase() !== SPAWN_LAYER_NAME)
      .map((l) => ({
        name: l.name,
        opacity:
          l.opacity ??
          (l.name.toLowerCase() === "shadows" ? 0.45 : 1),
        data: l.data,
      })),
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

/** Convenience guard — pure-decoration layer name? */
export function isPureDecorationLayer(name: string): boolean {
  return PURE_DECORATION_NAMES.has(name.toLowerCase());
}
