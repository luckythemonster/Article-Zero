// Physics tunables for the player movement layer. Single source of truth so
// designers can iterate without grepping through the codebase.

export const TILE_PX = 32;

/** Walking speed in px/sec for the WALK state. */
export const PLAYER_BASE_SPEED = 90;
/** Walking speed in px/sec for the CREEP state. */
export const PLAYER_CREEP_SPEED = 45;

/** Velocity multiplier when climbing a stair (velocity aligns with stair dir). */
export const STAIRS_UP_FACTOR = 0.75;
/** Velocity multiplier when descending a stair (velocity opposes stair dir). */
export const STAIRS_DOWN_FACTOR = 1.25;

/** Pixel offset applied to the sprite's displayY per elevation step. The
 *  physics body never moves on this axis — only the rendered sprite. */
export const ELEVATION_PX_PER_STEP = 8;

/** Throttle for the per-frame proximity sight check on guards (ms). */
export const FRAME_SIGHT_CHECK_MS = 250;

/** Player body bounding box (slightly smaller than a tile so doorway grazing
 *  doesn't trigger crossings prematurely). */
export const PLAYER_BODY_PX = TILE_PX - 12;
