// EngineAdapter — narrow facade over Phaser. The rest of the codebase imports
// from here so a future engine swap (Phaser 4 ↔ 3.90) is a single-file change.
//
// We currently target Phaser 4.0.0. The Phaser 3 adapter would live alongside
// this file as `EngineAdapter.phaser3.ts` and be selected via build flag.

import * as Phaser from "phaser";

export type SceneCtor = new (...args: any[]) => Phaser.Scene;

export interface GameConfigInput {
  parent: HTMLElement;
  width: number;
  height: number;
  backgroundColor: string;
  scenes: SceneCtor[];
  pixelArt?: boolean;
}

export function createGame(cfg: GameConfigInput): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: cfg.parent,
    width: cfg.width,
    height: cfg.height,
    backgroundColor: cfg.backgroundColor,
    pixelArt: cfg.pixelArt ?? true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: cfg.scenes,
    banner: false,
  });
}

export { Phaser };
