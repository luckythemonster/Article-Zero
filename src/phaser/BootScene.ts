// BootScene — preload textures, register character animations, then start
// into the RoomScene for whichever module was passed via Phaser registry.
// Falls back to "EREMITE" when launched standalone (dev convenience).

import { Phaser } from "../engine/EngineAdapter";
import { CHAR_ANIMS } from "../data/char-anims";
import { MOOSE_TILESETS } from "../data/tilesets/registry.generated";
import { mooseAnimKey } from "../data/tilesets/anim-keys";
import { worldEngine } from "../engine/WorldEngine";
import type { Era } from "../types/world.types";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    this.load.image("tileset", "/assets/tileset.png");
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
    // Held-item: bypass_drive 4-cardinal rotations (32x32 each).
    for (const dir of ["north", "east", "south", "west"] as const) {
      const key = `bypass_drive_${dir}`;
      if (this.textures.exists(key)) continue;
      this.load.image(key, `/assets/items/bypass_drive/${dir}.png`);
    }
    // EMP detonation animation frames (256×256 each, 9 frames).
    for (let i = 1; i <= 9; i++) {
      const key = `emp_frame_${i}`;
      if (this.textures.exists(key)) continue;
      this.load.image(key, `/assets/items/emp/frames_${String(i).padStart(4, "0")}.png`);
    }
  }

  create(): void {
    // Defensive: skip animations if the chars-art atlas failed to load.
    const haveCharsArt = this.textures.exists("chars-art");
    if (haveCharsArt) {
      for (const a of CHAR_ANIMS) {
        if (this.anims.exists(a.key)) continue;
        const texture = a.texture ?? "chars-art";
        const frames = a.frames.map((f) => ({ key: texture, frame: f }));
        this.anims.create({
          key: a.key,
          frames,
          frameRate: a.frameRate,
          repeat: a.repeat,
        });
      }
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

    // EMP detonation animation (9 frames, 18 fps, one-shot).
    if (!this.anims.exists("emp_detonation")) {
      this.anims.create({
        key: "emp_detonation",
        frames: Array.from({ length: 9 }, (_, i) => ({ key: `emp_frame_${i + 1}` })),
        frameRate: 18,
        repeat: 0,
      });
    }

    // Boot the world and start the renderer.
    const moduleId = (this.registry.get("moduleId") as Era | undefined) ?? "EREMITE";
    worldEngine.initWorld(moduleId);
    this.scene.start("RoomScene");
  }
}
