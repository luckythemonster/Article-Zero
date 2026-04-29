// GameScene — the in-world renderer. Reads from WorldEngine state and redraws
// tiles + sprites + visibility mask. Phaser is a slave to the EventBus; it
// never owns gameplay state.

import { Phaser } from "../engine/EngineAdapter";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import type { Entity, Facing, Tile, TileKind } from "../types/world.types";

const TILE_PX = 32;
const SPRITE_SCALE = TILE_PX / 36; // atlas frames are 36×36

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
  SHARED_FIELD_RIG: 0x18403a,
};

function playerAnimKey(facing: Facing, walking: boolean): string {
  return walking
    ? `solibarracastro_walkcycle_${facing}`
    : `solibarracastro_idle_${facing}`;
}

function entityAnimKey(entity: Entity, walking: boolean, chasing: boolean): string {
  const f = entity.facing;
  if (entity.kind === "ENFORCER") {
    if (chasing) return `enforcer_chase_${f}`;
    return walking ? `enforcer_walkcycle_${f}` : `enforcer_rotations_${f}`;
  }
  if (entity.id === "EIRA-7") {
    return walking ? `eira7_walkcycle_${f}` : `eira7_rotations_${f}`;
  }
  // Future characters: derive a key from the entity id ("APEX-19" → "apex19").
  // GameScene checks anims.exists() before playing, so a missing animation
  // automatically falls back to the glyph rectangle below.
  const id = entity.id.toLowerCase().replace(/[^a-z0-9]/g, "");
  return walking ? `${id}_walkcycle_${f}` : `${id}_idle_${f}`;
}

export class GameScene extends Phaser.Scene {
  private tileLayer!: Phaser.GameObjects.Graphics;
  private glyphLayer!: Phaser.GameObjects.Graphics;
  private overlayLayer!: Phaser.GameObjects.Graphics;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private entitySprites = new Map<string, Phaser.GameObjects.Sprite>();
  private entityRects = new Map<string, Phaser.GameObjects.Rectangle>();
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

    const initialFacing: Facing = worldEngine.hasState()
      ? worldEngine.getState().player.facing
      : "south";
    this.playerSprite = this.add.sprite(0, 0, "chars");
    this.playerSprite.setScale(SPRITE_SCALE);
    this.playerSprite.setDepth(5);
    this.tryPlay(this.playerSprite, playerAnimKey(initialFacing, false));

    this.floorLabel = this.add.text(12, 8, "", {
      fontFamily: "Courier New, monospace",
      fontSize: "13px",
      color: "#9bb1b6",
    });
    this.floorLabel.setDepth(20);

    this.layout();
    this.scale.on("resize", () => this.layout());

    eventBus.on("FOV_UPDATED", () => this.redraw());
    eventBus.on("PLAYER_MOVED", () => this.redraw());
    eventBus.on("DOOR_TOGGLED", () => this.redraw());
    eventBus.on("ENTITY_MOVED", () => this.redraw());
    eventBus.on("TURN_START", () => this.redraw());
    eventBus.on("ENTITY_STATUS_CHANGED", () => this.redraw());

    this.redraw();
  }

  private tryPlay(sprite: Phaser.GameObjects.Sprite, key: string): void {
    if (!key) return;
    if (!this.anims.exists(key)) return;
    if (sprite.anims.currentAnim?.key === key && sprite.anims.isPlaying) return;
    sprite.play(key, true);
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

    const memoryActive = state.player.entangled === true;
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const tile = floor.tiles[y * floor.width + x];
        const key = `${x},${y},${floor.z}`;
        const visible = state.visibleTiles.has(key);
        const remembered = memoryActive && state.memoryTrace.has(key);
        this.drawTile(tile, x, y, visible, remembered);
      }
    }

    // Hide all sprites/rects first; we re-show what's still relevant.
    for (const sprite of this.entitySprites.values()) sprite.setVisible(false);
    for (const rect of this.entityRects.values()) rect.setVisible(false);

    const violationsActive = state.violations.length > 0;

    for (const entity of state.entities.values()) {
      if (entity.kind === "PLAYER" || entity.status !== "ACTIVE") continue;
      if (entity.pos.z !== floor.z) continue;
      const px = this.offsetX + entity.pos.x * TILE_PX + TILE_PX / 2;
      const py = this.offsetY + entity.pos.y * TILE_PX + TILE_PX / 2;
      const visible = state.visibleTiles.has(`${entity.pos.x},${entity.pos.y},${floor.z}`);
      const walking = (entity.lastMoveTurn ?? -1) >= state.turn - 1;
      const animKey = entityAnimKey(entity, walking, state.detected && violationsActive);
      const hasArt = animKey && this.anims.exists(animKey);

      if (hasArt) {
        let sprite = this.entitySprites.get(entity.id);
        if (!sprite) {
          sprite = this.add.sprite(px, py, "chars");
          sprite.setScale(SPRITE_SCALE);
          sprite.setDepth(5);
          this.entitySprites.set(entity.id, sprite);
        }
        sprite.setPosition(px, py);
        sprite.setVisible(visible);
        this.tryPlay(sprite, animKey);
      } else {
        // No registered animation: render as a tinted rectangle so the entity
        // is still visible. New character art added via `npm run art` will
        // automatically take over once the animation key exists.
        let rect = this.entityRects.get(entity.id);
        if (!rect) {
          rect = this.add.rectangle(px, py, TILE_PX - 8, TILE_PX - 8, 0x6ad0a4);
          rect.setStrokeStyle(2, 0xe6f0f2);
          rect.setDepth(4);
          rect.setAlpha(0.5);
          this.entityRects.set(entity.id, rect);
        }
        rect.setPosition(px, py);
        rect.setVisible(visible);
      }
    }

    // Player sprite + animation
    const ppx = this.offsetX + state.player.pos.x * TILE_PX + TILE_PX / 2;
    const ppy = this.offsetY + state.player.pos.y * TILE_PX + TILE_PX / 2;
    this.playerSprite.setPosition(ppx, ppy);
    const playerWalking = (state.player.lastMoveTurn ?? -1) >= state.turn - 1;
    this.tryPlay(this.playerSprite, playerAnimKey(state.player.facing, playerWalking));

    if (state.detained) {
      this.overlayLayer.fillStyle(0x4a0d0d, 0.45);
      this.overlayLayer.fillRect(0, 0, this.scale.width, this.scale.height);
    }
  }

  private drawTile(
    tile: Tile,
    x: number,
    y: number,
    visible: boolean,
    remembered: boolean,
  ): void {
    const px = this.offsetX + x * TILE_PX;
    const py = this.offsetY + y * TILE_PX;
    const baseColour = TILE_COLORS[tile.kind];
    if (visible) {
      this.tileLayer.fillStyle(baseColour, 1);
      this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
      this.tileLayer.lineStyle(1, 0x223035, 0.6);
      this.tileLayer.strokeRect(px, py, TILE_PX - 1, TILE_PX - 1);
      this.drawGlyph(px + TILE_PX / 2, py + TILE_PX / 2, tile.kind);
    } else if (remembered) {
      // Insomnia memory trace: previously seen tiles render at reduced
      // contrast forever after the player becomes entangled.
      this.tileLayer.fillStyle(baseColour, 0.42);
      this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
      this.tileLayer.lineStyle(1, 0x223035, 0.25);
      this.tileLayer.strokeRect(px, py, TILE_PX - 1, TILE_PX - 1);
    } else {
      this.tileLayer.fillStyle(baseColour, 0.18);
      this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
    }
  }

  private drawGlyph(cx: number, cy: number, kind: TileKind): void {
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
    } else if (kind === "SHARED_FIELD_RIG") {
      // Two interlocked diamonds — "shared" + "field"
      g.lineStyle(2, 0x6fdbe6, 1);
      g.strokeCircle(cx - 3, cy, 5);
      g.strokeCircle(cx + 3, cy, 5);
    }
  }
}
