// BootScene — preload textures, register character animations, then start
// directly into the rebuilt RoomScene with the Commonwealth era.
//
// In the rebuild the era branch selector is gone; we boot straight into the
// playable slice. Future eras can be picked from a debug overlay.

import { Phaser } from "../engine/EngineAdapter";
import { CHAR_ANIMS } from "../data/char-anims";
import { MOOSE_TILESETS } from "../data/tilesets/registry.generated";
import { mooseAnimKey } from "../data/tilesets/anim-keys";
import { worldEngine } from "../engine/WorldEngine";

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
    this.load.atlas(
      "chars-art",
      "/assets/sprite_pack/chars-art.png",
      "/assets/sprite_pack/chars-art.json",
    );
    for (const t of MOOSE_TILESETS) {
      if (this.textures.exists(t.key)) continue;
      this.load.spritesheet(t.key, t.path, {
        frameWidth: t.frameWidth,
        frameHeight: t.frameHeight,
        spacing: t.spacing,
      });
    }
  }

  create(): void {
    // Defensive: ignore any animations targeting atlases that failed to load.
    const haveCharsArt = this.textures.exists("chars-art");
    const haveChars = this.textures.exists("chars");
    for (const a of CHAR_ANIMS) {
      if (this.anims.exists(a.key)) continue;
      const texture = a.texture ?? "chars";
      if (texture === "chars-art" && !haveCharsArt) continue;
      if (texture === "chars" && !haveChars) continue;
      const frames = a.frames.map((f) => ({ key: texture, frame: f }));
      this.anims.create({
        key: a.key,
        frames,
        frameRate: a.frameRate,
        repeat: a.repeat,
      });
    }

    for (const t of MOOSE_TILESETS) {
      const anims = t.tileAnims ?? [];
      for (const anim of anims) {
        const openKey = mooseAnimKey(t.key, anim.handle, "open");
        const closeKey = mooseAnimKey(t.key, anim.handle, "close");
        if (!this.anims.exists(openKey)) {
          this.anims.create({
            key: openKey,
            frames: anim.frames.map((idx) => ({ key: t.key, frame: idx })),
            frameRate: anim.frameRate,
            repeat: 0,
          });
        }
        if (!this.anims.exists(closeKey)) {
          this.anims.create({
            key: closeKey,
            frames: [...anim.frames].reverse().map((idx) => ({ key: t.key, frame: idx })),
            frameRate: anim.frameRate,
            repeat: 0,
          });
        }
      }
    }

    // Boot the world and start the renderer.
    worldEngine.initWorld("ARC1");
    this.scene.start("RoomScene");
  }
}
