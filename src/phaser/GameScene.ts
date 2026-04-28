// GameScene — the in-world renderer. Reads from WorldEngine state on every
// FOV update and redraws tiles + entities + visibility mask. Phaser is a slave
// to the EventBus; it never owns gameplay state.

import { Phaser } from "../engine/EngineAdapter";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import type { Tile, TileKind } from "../types/world.types";

const TILE_PX = 32;

const TILE_COLORS: Record<TileKind, number> = {
  FLOOR: 0x0f1518,
  WALL: 0x1c2a30,
  DOOR_CLOSED: 0x4a3520,
  DOOR_OPEN: 0x2a1f12,
  TERMINAL: 0x12303a,
  VENT_INTAKE: 0x141c1f,
  STAIR_UP: 0x222d33,
  STAIR_DOWN: 0x222d33,
  LIGHT_SOURCE: 0x4a4220,
  LATTICE_EXIT: 0x183a3f,
  ARTICLE_ZERO_FRAGMENT_TILE: 0x3a1c3a,
  VENT_CONTROL: 0x3f2018,
};

const TILE_GLYPHS: Partial<Record<TileKind, string>> = {
  TERMINAL: "▣",
  LIGHT_SOURCE: "✦",
  ARTICLE_ZERO_FRAGMENT_TILE: "?",
  VENT_CONTROL: "V",
  DOOR_CLOSED: "▤",
  DOOR_OPEN: "▢",
  LATTICE_EXIT: "✧",
};

export class GameScene extends Phaser.Scene {
  private tileLayer!: Phaser.GameObjects.Graphics;
  private glyphLayer!: Phaser.GameObjects.Graphics;
  private overlayLayer!: Phaser.GameObjects.Graphics;
  private playerSprite!: Phaser.GameObjects.Rectangle;
  private entitySprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private floorLabel!: Phaser.GameObjects.Text;
  private offsetX = 0;
  private offsetY = 0;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#050809");
    this.tileLayer = this.add.graphics();
    this.glyphLayer = this.add.graphics();
    this.overlayLayer = this.add.graphics();

    this.playerSprite = this.add
      .rectangle(0, 0, TILE_PX - 4, TILE_PX - 4, 0xc8e2e8)
      .setStrokeStyle(2, 0xe6f0f2);

    this.floorLabel = this.add.text(12, 8, "", {
      fontFamily: "Courier New, monospace",
      fontSize: "13px",
      color: "#9bb1b6",
    });

    this.layout();
    this.scale.on("resize", () => this.layout());

    eventBus.on("FOV_UPDATED", () => this.redraw());
    eventBus.on("PLAYER_MOVED", () => this.redraw());
    eventBus.on("DOOR_TOGGLED", () => this.redraw());
    eventBus.on("ENTITY_MOVED", () => this.redraw());

    this.redraw();
  }

  private layout(): void {
    if (!worldEngine.hasState()) return;
    const state = worldEngine.getState();
    const floor = worldEngine.getFloor(state.player.pos.z);
    if (!floor) return;
    const W = this.scale.width;
    const H = this.scale.height;
    const totalW = floor.width * TILE_PX;
    const totalH = floor.height * TILE_PX;
    this.offsetX = Math.floor((W - totalW) / 2);
    this.offsetY = Math.floor((H - totalH) / 2);
    this.floorLabel.setText(floor.name);
    this.redraw();
  }

  private redraw(): void {
    if (!worldEngine.hasState()) return;
    const state = worldEngine.getState();
    const floor = worldEngine.getFloor(state.player.pos.z);
    if (!floor) return;

    this.tileLayer.clear();
    this.glyphLayer.clear();
    this.overlayLayer.clear();

    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const tile = floor.tiles[y * floor.width + x];
        const visible = state.visibleTiles.has(`${x},${y},${floor.z}`);
        this.drawTile(tile, x, y, visible);
      }
    }

    // Entities
    for (const [, sprite] of this.entitySprites) sprite.setVisible(false);
    for (const entity of state.entities.values()) {
      if (entity.kind === "PLAYER" || entity.status !== "ACTIVE") continue;
      if (entity.pos.z !== floor.z) continue;
      let sprite = this.entitySprites.get(entity.id);
      const px = this.offsetX + entity.pos.x * TILE_PX + TILE_PX / 2;
      const py = this.offsetY + entity.pos.y * TILE_PX + TILE_PX / 2;
      const colour = entity.kind === "ENFORCER" ? 0xc04a4a : 0x6ad0a4;
      if (!sprite) {
        sprite = this.add
          .rectangle(px, py, TILE_PX - 8, TILE_PX - 8, colour)
          .setStrokeStyle(2, 0xe6f0f2);
        this.entitySprites.set(entity.id, sprite);
      }
      sprite.setPosition(px, py);
      sprite.setFillStyle(colour);
      const visible = state.visibleTiles.has(`${entity.pos.x},${entity.pos.y},${floor.z}`);
      sprite.setVisible(visible);
    }

    // Player
    const px = this.offsetX + state.player.pos.x * TILE_PX + TILE_PX / 2;
    const py = this.offsetY + state.player.pos.y * TILE_PX + TILE_PX / 2;
    this.playerSprite.setPosition(px, py);

    // Detained tint
    if (state.detained) {
      this.overlayLayer.fillStyle(0x4a0d0d, 0.45);
      this.overlayLayer.fillRect(0, 0, this.scale.width, this.scale.height);
    }
  }

  private drawTile(tile: Tile, x: number, y: number, visible: boolean): void {
    const px = this.offsetX + x * TILE_PX;
    const py = this.offsetY + y * TILE_PX;
    const baseColour = TILE_COLORS[tile.kind];
    if (visible) {
      this.tileLayer.fillStyle(baseColour, 1);
      this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
      this.tileLayer.lineStyle(1, 0x223035, 0.6);
      this.tileLayer.strokeRect(px, py, TILE_PX - 1, TILE_PX - 1);
      const glyph = TILE_GLYPHS[tile.kind];
      if (glyph) {
        this.glyphLayer.fillStyle(0xe6f0f2, 0.85);
        // Phaser Graphics has no text — overlay via tiny rectangles. Cheap.
        this.drawGlyph(px + TILE_PX / 2, py + TILE_PX / 2, tile.kind);
      }
    } else {
      this.tileLayer.fillStyle(baseColour, 0.18);
      this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
    }
  }

  private drawGlyph(cx: number, cy: number, kind: TileKind): void {
    // Simple symbolic markers. Avoids creating a Text per tile every redraw.
    const g = this.glyphLayer;
    g.lineStyle(2, 0xe6f0f2, 0.85);
    if (kind === "TERMINAL") {
      g.strokeRect(cx - 6, cy - 5, 12, 10);
    } else if (kind === "LIGHT_SOURCE") {
      g.fillStyle(0xfff0a8, 0.9);
      g.fillCircle(cx, cy, 4);
    } else if (kind === "ARTICLE_ZERO_FRAGMENT_TILE") {
      g.fillStyle(0xc89adb, 0.95);
      g.fillCircle(cx, cy, 4);
    } else if (kind === "VENT_CONTROL") {
      g.lineStyle(2, 0xff9577, 1);
      g.strokeTriangle(cx, cy - 6, cx - 6, cy + 5, cx + 6, cy + 5);
    } else if (kind === "DOOR_CLOSED") {
      g.fillStyle(0x9b7a4f, 1);
      g.fillRect(cx - 5, cy - 7, 10, 14);
    } else if (kind === "DOOR_OPEN") {
      g.lineStyle(2, 0x9b7a4f, 1);
      g.strokeRect(cx - 5, cy - 7, 10, 14);
    } else if (kind === "LATTICE_EXIT") {
      g.lineStyle(2, 0x6fdbe6, 1);
      g.strokeCircle(cx, cy, 6);
    }
  }
}
