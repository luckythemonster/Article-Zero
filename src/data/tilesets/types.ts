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
  /** Phaser texture key. Slugified project name, valid as a JS identifier. */
  key: string;
  /** Display name preserved from the original Ed project (may contain spaces). */
  label: string;
  /** URL the BootScene fetches. */
  path: string;
  frameWidth: number;
  frameHeight: number;
  spacing: number;
  /** Multi-keyframe TileDefs to register as Phaser animations. Empty when
   *  the project has no animated TileDefs. */
  tileAnims?: MooseTileAnim[];
}

/** A multi-keyframe TileDef captured from Ed's `Animation.KeyFrames` array.
 *  Painted cells whose tile records `baseFrame` are eligible to play this
 *  animation on a state event (e.g. DOOR_TOGGLED). */
export interface MooseTileAnim {
  /** TileDef.Handle from edplay.json — stable across re-imports. */
  handle: number;
  /** TileDef.Ref string ("Door South" etc). For diagnostics + future
   *  orientation-aware selection. */
  label: string;
  /** Frame index of KeyFrames[0] — what's stored on painted cells in the
   *  layer data. The renderer looks up animations by this. */
  baseFrame: number;
  /** Frame index of the final keyframe — what the sprite settles on after
   *  the open animation completes. */
  settleFrame: number;
  /** Phaser frame indices for the full open sequence (length === number of
   *  keyframes). The close animation is the reverse of this list. */
  frames: number[];
  /** Animation.Rate from Ed (frames per second). */
  frameRate: number;
}
