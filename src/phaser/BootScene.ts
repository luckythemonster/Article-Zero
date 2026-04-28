// BootScene — preload textures, then jump straight to the BranchSelector.
// We're intentionally small here; the game does not depend on heavy assets.

import { Phaser } from "../engine/EngineAdapter";

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
    this.scene.start("BranchSelectorScene");
  }
}
