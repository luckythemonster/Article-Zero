// TilesetSandboxScene — visual proof-of-life for the stairs tileset.
// Loads the 1600x32 sheet (48 frames @ 32x32, 1px gutter), lays every frame
// out in an 8-column grid scaled 2x with index + ref labels, so we can
// identify which frame to wire into which game-tile semantics later.
//
// Reach this from the BranchSelector's 4th option ("DEV / TILE PALETTE").
// ESC returns to the selector.

import { Phaser } from "../engine/EngineAdapter";
import {
  STAIRS_FRAMES,
  STAIRS_FRAME_COUNT,
  STAIRS_TEXTURE_KEY,
} from "../data/tilesets/stairs";

const SOURCE_TILE = 32;
const DISPLAY_TILE = 64;
const COLS = 8;
const PADDING = 12;
const LABEL_HEIGHT = 28;

export class TilesetSandboxScene extends Phaser.Scene {
  constructor() {
    super({ key: "TilesetSandboxScene" });
  }

  preload(): void {
    if (this.textures.exists(STAIRS_TEXTURE_KEY)) return;
    this.load.spritesheet(STAIRS_TEXTURE_KEY, "/assets/tilesets/stairs.png", {
      frameWidth: SOURCE_TILE,
      frameHeight: SOURCE_TILE,
      spacing: 1,
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#050809");

    this.add.text(PADDING, PADDING, "TILE PALETTE // stairs.png", {
      fontFamily: "Courier New, monospace",
      fontSize: "13px",
      color: "#cfe9ee",
    });
    this.add.text(PADDING, PADDING + 18,
      `${STAIRS_FRAME_COUNT} frames @ 32x32 (1px gutter). ESC to return.`, {
      fontFamily: "Courier New, monospace",
      fontSize: "11px",
      color: "#7fa1a8",
    });

    const gridTop = PADDING + 60;
    const cellW = DISPLAY_TILE + PADDING;
    const cellH = DISPLAY_TILE + LABEL_HEIGHT + PADDING;
    const gridW = COLS * cellW;
    const offsetX = Math.max(PADDING, Math.floor((this.scale.width - gridW) / 2));

    for (const f of STAIRS_FRAMES) {
      const col = f.index % COLS;
      const row = Math.floor(f.index / COLS);
      const x = offsetX + col * cellW;
      const y = gridTop + row * cellH;

      // Cell border
      const border = this.add.rectangle(
        x + DISPLAY_TILE / 2,
        y + DISPLAY_TILE / 2,
        DISPLAY_TILE + 4,
        DISPLAY_TILE + 4,
      );
      border.setStrokeStyle(1, 0x14222a);
      border.setFillStyle(0x0a1014);

      // Frame image, scaled 2x for legibility
      this.add.image(
        x + DISPLAY_TILE / 2,
        y + DISPLAY_TILE / 2,
        STAIRS_TEXTURE_KEY,
        f.index,
      ).setScale(DISPLAY_TILE / SOURCE_TILE);

      // Index + ref label
      this.add.text(
        x + DISPLAY_TILE / 2,
        y + DISPLAY_TILE + 4,
        `#${f.index}`,
        {
          fontFamily: "Courier New, monospace",
          fontSize: "11px",
          color: "#cfe9ee",
        },
      ).setOrigin(0.5, 0);
      if (f.ref) {
        this.add.text(
          x + DISPLAY_TILE / 2,
          y + DISPLAY_TILE + 18,
          f.ref.replace(/^IMG_3722_/, "rule_").slice(0, 14),
          {
            fontFamily: "Courier New, monospace",
            fontSize: "9px",
            color: f.brush ? "#c89adb" : "#7fa1a8",
          },
        ).setOrigin(0.5, 0);
      }
    }

    this.input.keyboard?.on("keydown-ESC", () => {
      this.scene.start("BranchSelectorScene");
    });
  }
}
