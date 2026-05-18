// Variant counts per (surface, action). Used by Footsteps to know how many
// wav files exist in each pool. Kept in sync with `public/audio/footsteps/`
// by `scripts/mount-footsteps.sh`. If you change asset counts, edit here.

import type { SurfaceType } from "../types/world.types";

export type FootstepAction = "walk" | "run";

export const FOOTSTEP_VARIANTS: Record<SurfaceType, Record<FootstepAction, number>> = {
  dirtyground: { walk: 10, run: 10 },
  gravel:      { walk: 10, run: 10 },
  metalv1:     { walk: 15, run: 15 },
  metalv2:     { walk: 15, run: 15 },
  rock:        { walk: 9,  run: 10 },
  tile:        { walk: 8,  run: 6  },
  wood:        { walk: 9,  run: 10 },
};
