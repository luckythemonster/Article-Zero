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
  era: Era;
  title: string;
  body: string;
  status: "LIVE" | "STUB";
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
    status: "STUB",
  },
  {
    era: "MIRADOR",
    title: "3. MIRADOR // CIVIX-1 BOOTH",
    body:
      "MARA IBARRA. Bragg goes live in four minutes. The persona package is loading. You have noticed the loop before.",
    status: "STUB",
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
      const tag = choice.status === "LIVE" ? "[ENTER]" : "[TRANSMISSION INCOMPLETE]";
      this.add.text(W - 80, y, tag, {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: choice.status === "LIVE" ? "#7fc7d4" : "#3f5358",
      }).setOrigin(1, 0);
      title.setInteractive({ useHandCursor: true });
      title.on("pointerdown", () => this.selectEra(choice.era));
    });

    this.add.text(W / 2, H - 40, "press 1, 2, or 3", {
      fontFamily: "Courier New, monospace",
      fontSize: "12px",
      color: "#5e7a80",
    }).setOrigin(0.5, 1);

    this.input.keyboard?.on("keydown-ONE", () => this.selectEra("COMMONWEALTH"));
    this.input.keyboard?.on("keydown-TWO", () => this.selectEra("LATTICE"));
    this.input.keyboard?.on("keydown-THREE", () => this.selectEra("MIRADOR"));
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
