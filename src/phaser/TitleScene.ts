import { Phaser } from "../engine/EngineAdapter";

export class TitleScene extends Phaser.Scene {
  private titleText!: Phaser.GameObjects.BitmapText;
  private subtitleText!: Phaser.GameObjects.BitmapText;

  private titleTarget = "ARTICLE ZERO";
  private subtitleTarget = "A SOLAR OPUS";
  private chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:'\",.<>/?";

  private titleStartTime = 0;
  private subtitleStartTime = 0;

  constructor() {
    super({ key: "TitleScene" });
  }

  preload() {
    this.load.image("title-bg", "/assets/ui/title/background.png");
    this.load.bitmapFont(
      "ethnocentric",
      "/assets/ui/title/fonts/Ethnocentric_title_screen_title.png",
      "/assets/ui/title/fonts/Ethnocentric_title_screen_title.xml"
    );
    this.load.bitmapFont(
      "asimovian",
      "/assets/ui/title/fonts/Asimovian_title_screen_subtitle.png",
      "/assets/ui/title/fonts/Asimovian_title_screen_subtitle.xml"
    );
  }

  create() {
    const { width, height } = this.scale;

    // Background
    const bg = this.add.image(width / 2, height / 2, "title-bg");
    bg.setDisplaySize(width, height);

    // Title text
    const titleY = height * 0.07;
    this.titleText = this.add.bitmapText(width / 2, titleY, "ethnocentric", "", 128)
      .setOrigin(0.5, 0)
      .setScale(0.66)
      .setTint(0x99ff99); // slight phosphor green tint

    // Subtitle text
    const subtitleY = height * 0.28;
    this.subtitleText = this.add.bitmapText(width / 2, subtitleY, "asimovian", "", 128)
      .setOrigin(0.5, 0)
      .setScale(0.5)
      .setLetterSpacing(10)
      .setTint(0xccffcc);

    this.titleStartTime = this.time.now;
    this.subtitleStartTime = this.time.now + 500;
  }

  update(time: number, _delta: number) {
    this.updateFlicker(this.titleText, this.titleTarget, time, this.titleStartTime, 6000);
    this.updateFlicker(this.subtitleText, this.subtitleTarget, time, this.subtitleStartTime, 5000);
  }

  private updateFlicker(
    textObj: Phaser.GameObjects.BitmapText,
    targetText: string,
    time: number,
    startTime: number,
    durationMs: number
  ) {
    if (time < startTime) return;

    const elapsed = time - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const charsToFix = Math.floor(progress * targetText.length);

    let currentString = "";

    // Glitch effect
    const isGlitching = Math.random() < 0.02 && elapsed > durationMs && (elapsed % 3000) < 100;

    for (let i = 0; i < targetText.length; i++) {
      if (targetText[i] === " ") {
        currentString += " ";
      } else if (i < charsToFix && !isGlitching) {
        currentString += targetText[i];
      } else {
        const scrambleSeed = Math.floor(time / 60) + i;
        const randomChar = this.chars[scrambleSeed % this.chars.length];
        currentString += randomChar;
      }
    }

    textObj.setText(currentString);
  }
}
