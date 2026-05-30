// VFX registry — Lucky's sci-fi sprite-strips, staged into public/assets/vfx/
// by `npm run mount:vfx` (scripts/mount-vfx.sh). Each strip is a single-row,
// uniform, no-spacing spritesheet, so BootScene preloads it with
// `load.spritesheet({ frameWidth, frameHeight })` and registers a one-shot anim.
// Frame sizes / counts are taken from each effect's spritesheet.txt.

import type { ItemType } from "../../types/world.types";

export interface VfxEffect {
  /** Phaser animation key, also used as the texture key. */
  key: string;
  /** Public path to the staged spritesheet. */
  path: string;
  /** Square frame size in px — used for both loading and detonation scaling. */
  frameSize: number;
  frameCount: number;
  frameRate: number;
}

export const VFX_EFFECTS: VfxEffect[] = [
  { key: "vfx_explosion_violet", path: "/assets/vfx/explosion_violet.png", frameSize: 96, frameCount: 10, frameRate: 18 },
  { key: "vfx_spark_yellow", path: "/assets/vfx/spark_yellow.png", frameSize: 128, frameCount: 12, frameRate: 18 },
  { key: "vfx_charge_yellow", path: "/assets/vfx/charge_yellow.png", frameSize: 96, frameCount: 12, frameRate: 18 },
  { key: "vfx_lightning_violet_s", path: "/assets/vfx/lightning_violet_s.png", frameSize: 64, frameCount: 8, frameRate: 18 },
  { key: "vfx_lightning_violet_m", path: "/assets/vfx/lightning_violet_m.png", frameSize: 64, frameCount: 9, frameRate: 18 },
  { key: "vfx_lightning_violet_l", path: "/assets/vfx/lightning_violet_l.png", frameSize: 96, frameCount: 10, frameRate: 18 },
  { key: "vfx_warp_green_l", path: "/assets/vfx/warp_green_l.png", frameSize: 128, frameCount: 10, frameRate: 18 },
  { key: "vfx_warp_green_s", path: "/assets/vfx/warp_green_s.png", frameSize: 64, frameCount: 10, frameRate: 18 },
  { key: "vfx_warp_red_l", path: "/assets/vfx/warp_red_l.png", frameSize: 96, frameCount: 10, frameRate: 18 },
  { key: "vfx_warp_red_s", path: "/assets/vfx/warp_red_s.png", frameSize: 48, frameCount: 10, frameRate: 18 },
  { key: "vfx_warp_blue_l", path: "/assets/vfx/warp_blue_l.png", frameSize: 128, frameCount: 12, frameRate: 18 },
  { key: "vfx_warp_blue_s", path: "/assets/vfx/warp_blue_s.png", frameSize: 64, frameCount: 12, frameRate: 18 },
];

const VFX_BY_KEY = new Map(VFX_EFFECTS.map((e) => [e.key, e]));

export function getVfxEffect(key: string): VfxEffect | undefined {
  return VFX_BY_KEY.get(key);
}

/** Detonation effect per item. Items absent here fall back in playDetonation(). */
export const ITEM_DETONATION_FX: Partial<Record<ItemType, string>> = {
  EMP: "vfx_spark_yellow",
  EMP_GRENADE: "vfx_spark_yellow",
  Q_MINE: "vfx_explosion_violet",
};

export const DEFAULT_DETONATION_FX = "vfx_spark_yellow";
