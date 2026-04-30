// TilesetSandboxScene — visual proof-of-life for imported Moose tilesets.
// Shows every frame from a chosen sheet in an indexed grid scaled up for
// legibility, with the frame's index + Ed `Ref` printed underneath. Use
// the < / > keys to cycle through registered sheets. ESC returns to the
// selector.

import { Phaser } from "../engine/EngineAdapter";
import { MOOSE_TILESETS } from "../data/tilesets/registry.generated";

const DISPLAY_W = 64; // each cell renders 2× the source frame width
const COLS = 8;
const PADDING = 12;
const LABEL_HEIGHT = 28;

export class TilesetSandboxScene extends Phaser.Scene {
  private sheetIndex = 0;

  constructor() {
    super({ key: "TilesetSandboxScene" });
  }

  preload(): void {
    // Defensive — BootScene already loads everything in MOOSE_TILESETS, but
    // re-issue the loads here in case the scene is reached without boot.
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
    this.cameras.main.setBackgroundColor("#050809");
    this.input.keyboard?.on("keydown-ESC", () => {
      this.scene.start("BranchSelectorScene");
    });
    this.input.keyboard?.on("keydown-LEFT", () => this.cycle(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.cycle(1));
    this.input.keyboard?.on("keydown-COMMA", () => this.cycle(-1));
    this.input.keyboard?.on("keydown-PERIOD", () => this.cycle(1));
    this.render();
  }

  private cycle(delta: number): void {
    if (MOOSE_TILESETS.length === 0) return;
    this.sheetIndex =
      (this.sheetIndex + delta + MOOSE_TILESETS.length) % MOOSE_TILESETS.length;
    this.render();
  }

  private render(): void {
    this.children.removeAll();

    if (MOOSE_TILESETS.length === 0) {
      this.add.text(PADDING, PADDING, "TILE PALETTE // (no tilesets imported)", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#cfe9ee",
      });
      this.add.text(PADDING, PADDING + 22,
        "Run `npm run moose -- art/moose/<file>.zip`. ESC to return.", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#7fa1a8",
      });
      return;
    }

    const t = MOOSE_TILESETS[this.sheetIndex];
    const tex = this.textures.get(t.key);
    const frameNames = tex.getFrameNames();
    const frameCount = frameNames.length;

    const displayW = DISPLAY_W;
    const displayH = Math.round(DISPLAY_W * (t.frameHeight / t.frameWidth));

    this.add.text(PADDING, PADDING, `TILE PALETTE // ${t.label}`, {
      fontFamily: "Courier New, monospace",
      fontSize: "13px",
      color: "#cfe9ee",
    });
    this.add.text(PADDING, PADDING + 18,
      `${frameCount} frames @ ${t.frameWidth}x${t.frameHeight}` +
      ` (${t.spacing}px gutter). ${this.sheetIndex + 1} / ${MOOSE_TILESETS.length}` +
      `   ◀ ▶ to cycle, ESC to return.`, {
      fontFamily: "Courier New, monospace",
      fontSize: "11px",
      color: "#7fa1a8",
    });

    const gridTop = PADDING + 60;
    const cellW = displayW + PADDING;
    const cellH = displayH + LABEL_HEIGHT + PADDING;
    const gridW = COLS * cellW;
    const offsetX = Math.max(PADDING, Math.floor((this.scale.width - gridW) / 2));

    for (let i = 0; i < frameCount; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = offsetX + col * cellW;
      const y = gridTop + row * cellH;

      const border = this.add.rectangle(
        x + displayW / 2,
        y + displayH / 2,
        displayW + 4,
        displayH + 4,
      );
      border.setStrokeStyle(1, 0x14222a);
      border.setFillStyle(0x0a1014);

      const sprite = this.add.image(x + displayW / 2, y + displayH / 2, t.key, i);
      sprite.setDisplaySize(displayW, displayH);

      this.add.text(x + displayW / 2, y + displayH + 4, `#${i}`, {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#cfe9ee",
      }).setOrigin(0.5, 0);
    }

    this.add.text(PADDING, this.scale.height - 22,
      "ESC to return", {
      fontFamily: "Courier New, monospace",
      fontSize: "12px",
      color: "#5e7a80",
    });
  }
}
