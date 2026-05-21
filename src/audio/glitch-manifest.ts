// Glitch SFX index entry shape. The runtime fetches GLITCH_INDEX_URL
// once at preload; per-clip wav decoding is lazy on first play.
//
// Source pack: Glitch Noises by Vladislav Zharkov (vladislavzh.net),
// CC0 1.0 Universal. Index file produced by scripts/mount-glitch-sfx.sh.

export interface GlitchEntry {
  name: string;
  file: string;
  defaultVolume: number;
  loop: boolean;
  category: string;
}

export const GLITCH_INDEX_URL = "/audio/glitch/index.json";
