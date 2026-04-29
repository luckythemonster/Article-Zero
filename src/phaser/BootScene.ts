// BootScene — preload textures, register character animations from
// CHAR_ANIMS, then jump to the BranchSelector. Animations must exist before
// any GameScene plays them, so we do the registration here.

import { Phaser } from "../engine/EngineAdapter";
import { CHAR_ANIMS } from "../data/char-anims";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    this.load.image("tileset", "/assets/tileset.png");
    this.load.atlas(
      "chars",
      "/assets/sprite_pack/EIRA-7,_Enforcer,_Sol.png",
      "/assets/sprite_pack/EIRA-7,_Enforcer,_Sol.json",
    );
  }

  create(): void {
    for (const a of CHAR_ANIMS) {
      if (this.anims.exists(a.key)) continue;
      const frames = a.frames.map((f) => ({ key: "chars", frame: f }));
      this.anims.create({
        key: a.key,
        frames,
        frameRate: a.frameRate,
        repeat: a.repeat,
      });
    }
    this.scene.start("BranchSelectorScene");
  }
}
