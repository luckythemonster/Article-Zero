// BranchSelectorScene — cold-open + era picker. Three visible options:
//   COMMONWEALTH (live), LATTICE (live), BAFFLE (stub).
// MIRADOR is preserved as a hidden dev branch; press M to enter.
// Selecting an era seeds the WorldEngine and starts GameScene.

import { Phaser } from "../engine/EngineAdapter";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { tutorialDirector } from "../engine/TutorialDirector";
import { ambientHum } from "../audio/AmbientHum";
import { mooseSandboxEra } from "../data/eras/moose-sandbox";
import type { Era } from "../types/world.types";

type ChoiceTarget = Era | "PALETTE" | "MOOSE_LEVEL";

interface Choice {
  era: ChoiceTarget;
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
    era: "BAFFLE",
    title: "3. THE BAFFLE // OUTER HOUSING",
    body:
      "THE FINDER. Filter-mesh tight. Reader is heavy in your hands. The Sanding Wind has been moving since first light.",
    status: "STUB",
  },
  {
    era: "PALETTE",
    title: "4. DEV // TILE PALETTE",
    body:
      "Inspect every imported Moose tileset frame-by-frame. ◀ ▶ keys cycle between sheets. ESC to return.",
    status: "DEV",
  },
  {
    era: "MOOSE_LEVEL",
    title: "5. DEV // MOOSE LEVEL",
    body:
      "Walk Sol around the most recently imported Moose level (currently: maintenance stairwell). Tile decoration renders from the Phaser-loaded sheet.",
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

    this.add.text(W / 2, 18, "ARTICLE ZERO", {
      fontFamily: "Courier New, monospace",
      fontSize: "28px",
      color: "#e6f0f2",
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, 56, "PRE-LOAD // SELECT WITNESS", {
      fontFamily: "Courier New, monospace",
      fontSize: "12px",
      color: "#7fa1a8",
    }).setOrigin(0.5, 0);

    // Layout sized so all five entries + bottom hint fit in the 640-px
    // canvas height with margin. Each entry budgets ~92 px (title row +
    // up-to-two-line body).
    const top = 100;
    const lineH = 92;
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

    this.add.text(W / 2, H - 12, "press 1, 2, 3, 4, or 5", {
      fontFamily: "Courier New, monospace",
      fontSize: "12px",
      color: "#5e7a80",
    }).setOrigin(0.5, 1);

    this.input.keyboard?.on("keydown-ONE", () => this.selectChoice("COMMONWEALTH"));
    this.input.keyboard?.on("keydown-TWO", () => this.selectChoice("LATTICE"));
    this.input.keyboard?.on("keydown-THREE", () => this.selectChoice("BAFFLE"));
    this.input.keyboard?.on("keydown-FOUR", () => this.selectChoice("PALETTE"));
    this.input.keyboard?.on("keydown-FIVE", () => this.selectChoice("MOOSE_LEVEL"));
    // Dev-only: MIRADOR remains accessible via M for the broadcast-booth stub.
    this.input.keyboard?.on("keydown-M", () => this.selectChoice("MIRADOR"));
  }

  private selectChoice(choice: ChoiceTarget): void {
    if (choice === "PALETTE") {
      this.scene.start("TilesetSandboxScene");
      return;
    }
    if (choice === "MOOSE_LEVEL") {
      ambientHum.start();
      tutorialDirector.reset();
      tutorialDirector.init();
      worldEngine.initWorldFromSeed(mooseSandboxEra());
      this.scene.start("GameScene");
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
