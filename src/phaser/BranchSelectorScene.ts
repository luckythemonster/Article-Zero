// BranchSelectorScene — cold-open + era picker. Three options:
//   COMMONWEALTH (live), LATTICE (stub), MIRADOR (stub).
// Selecting an era seeds the WorldEngine and starts GameScene.

import { Phaser } from "../engine/EngineAdapter";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { tutorialDirector } from "../engine/TutorialDirector";
import { ambientHum } from "../audio/AmbientHum";
import type { Era } from "../types/world.types";

interface Choice {
  era: Era | "SANDBOX";
  title: string;
  body: string;
  status: "LIVE" | "STUB" | "DEV";
}

const CHOICES: Choice[] = [
  {
    era: "COMMONWEALTH",
    title: "1. COMMONWEALTH // NW-SMAC-01",
    body:
      "TECH-2 ROWAN-IBARRA. Alignment Bay 1, third shift. EIRA-7 has flagged APEX-19 for misdescription. The cycle is on schedule.",
    status: "LIVE",
  },
  {
    era: "LATTICE",
    title: "2. LATTICE // RING C — RUN 01",
    body:
      "SOL IBARRA-CASTRO. The shared field has been live for nine seconds. You can still feel the duct on the other side of your skin.",
    status: "LIVE",
  },
  {
    era: "MIRADOR",
    title: "3. MIRADOR // CIVIX-1 BOOTH",
    body:
      "MARA IBARRA. Bragg goes live in four minutes. The persona package is loading. You have noticed the loop before.",
    status: "STUB",
  },
  {
    era: "SANDBOX",
    title: "4. DEV // TILE PALETTE",
    body:
      "Inspect the stairs.png tileset (48 frames, 32x32, 1px gutter). ESC to return. Use this to pick which frames map to floor / wall / stair / door semantics.",
    status: "DEV",
  },
];

export class BranchSelectorScene extends Phaser.Scene {
  constructor() {
    super({ key: "BranchSelectorScene" });
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.cameras.main.setBackgroundColor("#050809");

    this.add.text(W / 2, 40, "ARTICLE ZERO", {
      fontFamily: "Courier New, monospace",
      fontSize: "32px",
      color: "#e6f0f2",
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, 84, "PRE-LOAD // SELECT WITNESS", {
      fontFamily: "Courier New, monospace",
      fontSize: "14px",
      color: "#7fa1a8",
    }).setOrigin(0.5, 0);

    const top = 140;
    const lineH = 110;
    CHOICES.forEach((choice, i) => {
      const y = top + i * lineH;
      const titleColor = choice.status === "LIVE" ? "#cfe9ee" : "#5e7a80";
      const title = this.add.text(80, y, choice.title, {
        fontFamily: "Courier New, monospace",
        fontSize: "18px",
        color: titleColor,
      });
      this.add.text(96, y + 30, choice.body, {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#9bb1b6",
        wordWrap: { width: W - 200 },
      });
      const tag = choice.status === "LIVE"
        ? "[ENTER]"
        : choice.status === "DEV"
          ? "[DEV]"
          : "[TRANSMISSION INCOMPLETE]";
      const tagColor = choice.status === "LIVE"
        ? "#7fc7d4"
        : choice.status === "DEV"
          ? "#c89adb"
          : "#3f5358";
      const titleColorActive = choice.status === "DEV" ? "#c89adb" : titleColor;
      title.setColor(titleColorActive);
      this.add.text(W - 80, y, tag, {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: tagColor,
      }).setOrigin(1, 0);
      title.setInteractive({ useHandCursor: true });
      title.on("pointerdown", () => this.selectChoice(choice.era));
    });

    this.add.text(W / 2, H - 40, "press 1, 2, 3, or 4", {
      fontFamily: "Courier New, monospace",
      fontSize: "12px",
      color: "#5e7a80",
    }).setOrigin(0.5, 1);

    this.input.keyboard?.on("keydown-ONE", () => this.selectChoice("COMMONWEALTH"));
    this.input.keyboard?.on("keydown-TWO", () => this.selectChoice("LATTICE"));
    this.input.keyboard?.on("keydown-THREE", () => this.selectChoice("MIRADOR"));
    this.input.keyboard?.on("keydown-FOUR", () => this.selectChoice("SANDBOX"));
  }

  private selectChoice(choice: Era | "SANDBOX"): void {
    if (choice === "SANDBOX") {
      this.scene.start("TilesetSandboxScene");
      return;
    }
    this.selectEra(choice);
  }

  private selectEra(era: Era): void {
    ambientHum.start();
    tutorialDirector.reset();
    tutorialDirector.init();
    worldEngine.initWorld(era);
    eventBus.emit("ERA_SELECTED", { era });
    this.scene.start("GameScene");
  }
}
