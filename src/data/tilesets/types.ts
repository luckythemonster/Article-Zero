// Shared types for assets imported from Ed / Chilling Moose.
// Populated by `npm run moose <project>.zip`; consumed by BootScene,
// GameScene, and the era seed helpers in src/data/eras/from-moose.ts.

export interface MooseSpriteFrame {
  /** 0-based frame index, matching the Phaser spritesheet slice order. */
  index: number;
  /** Original `Ref` from the Ed export (e.g. "stairwell1_3", "IMG_3722_9"). */
  ref: string | null;
  /** Brush id when the frame is part of an autotile rule-set. */
  brush: string | null;
}

export interface MooseLayer {
  name: string;
  opacity: number;
  /** Row-major 2D grid of 1-based tile indices (0 = empty). */
  data: number[][];
}

export interface MooseLevel {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  spacing: number;
  layers: MooseLayer[];
}

export interface MooseTilesetEntry {
  /** Phaser texture key. */
  key: string;
  /** URL the BootScene fetches. */
  path: string;
  frameSize: number;
  spacing: number;
}
