// RoomScene — renders ONE room at a time. On ROOM_ENTERED the renderer
// fades out, swaps to the new room, and fades back in. Vision cones for
// guards in the active room are drawn as faint overlays whose colour
// follows the AlertFSM level (NORMAL / CAUTION / ALERT / EVASION).

import { Phaser } from "../engine/EngineAdapter";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { guardSystem } from "../engine/GuardSystem";
import type { Entity, Facing, Room, Tile, TileKind } from "../types/world.types";

const TILE_PX = 48;

const TILE_COLORS: Record<TileKind, number> = {
  FLOOR: 0x0f1518,
  WALL: 0x1c2a30,
  DOOR_CLOSED: 0x4a3520,
  DOOR_OPEN: 0x2a1f12,
  TERMINAL: 0x12303a,
  EXTRACTION_TERMINAL: 0x3f2b3a,
  LIGHT_SOURCE: 0x4a4220,
};

const ALERT_COLORS: Record<string, { fill: number; alpha: number }> = {
  NORMAL: { fill: 0x9bb1b6, alpha: 0.06 },
  CAUTION: { fill: 0xebd14a, alpha: 0.18 },
  ALERT: { fill: 0xff5050, alpha: 0.28 },
  EVASION: { fill: 0xff9577, alpha: 0.14 },
};

export class RoomScene extends Phaser.Scene {
  private tileLayer!: Phaser.GameObjects.Graphics;
  private glyphLayer!: Phaser.GameObjects.Graphics;
  private coneLayer!: Phaser.GameObjects.Graphics;
  private overlayLayer!: Phaser.GameObjects.Graphics;
  private playerSprite!: Phaser.GameObjects.Rectangle;
  private playerFacingMark!: Phaser.GameObjects.Triangle;
  private entityRects = new Map<string, Phaser.GameObjects.Rectangle>();
  private entityFacingMarks = new Map<string, Phaser.GameObjects.Triangle>();
  private exclamationMarks = new Map<string, Phaser.GameObjects.Text>();
  private floorLabel!: Phaser.GameObjects.Text;
  private offsetX = 0;
  private offsetY = 0;

  constructor() {
    super({ key: "RoomScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#050809");
    this.tileLayer = this.add.graphics();
    this.glyphLayer = this.add.graphics();
    this.coneLayer = this.add.graphics();
    this.coneLayer.setDepth(2);
    this.overlayLayer = this.add.graphics();
    this.overlayLayer.setDepth(20);

    this.playerSprite = this.add.rectangle(0, 0, TILE_PX - 12, TILE_PX - 12, 0x6ad0a4);
    this.playerSprite.setStrokeStyle(2, 0xe6f0f2);
    this.playerSprite.setDepth(5);
    this.playerFacingMark = this.add.triangle(0, 0, 0, 0, -6, 8, 6, 8, 0xe6f0f2);
    this.playerFacingMark.setDepth(6);

    this.floorLabel = this.add.text(12, 8, "", {
      fontFamily: "Courier New, monospace",
      fontSize: "14px",
      color: "#9bb1b6",
    });
    this.floorLabel.setDepth(30);

    this.layout();
    this.scale.on("resize", () => this.layout());

    eventBus.on("ROOM_ENTERED", () => this.fadeAndRedraw());
    eventBus.on("FOV_UPDATED", () => this.redraw());
    eventBus.on("PLAYER_MOVED", () => this.redraw());
    eventBus.on("PLAYER_FACING_CHANGED", () => this.redraw());
    eventBus.on("DOOR_TOGGLED", () => this.redraw());
    eventBus.on("ENTITY_MOVED", () => this.redraw());
    eventBus.on("ENTITY_FACING_CHANGED", () => this.redraw());
    eventBus.on("GUARD_ALERT_CHANGED", () => this.redraw());
    eventBus.on("EXCLAMATION_TRIGGERED", (p) => this.flashExclamation(p.guardId));
    eventBus.on("TURN_START", () => this.redraw());

    this.redraw();
  }

  private fadeAndRedraw(): void {
    this.cameras.main.fadeOut(120, 5, 8, 9);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      // Reset entity sprites belonging to the previous room.
      for (const [id, rect] of this.entityRects) {
        rect.destroy();
        this.entityRects.delete(id);
      }
      for (const [id, mark] of this.entityFacingMarks) {
        mark.destroy();
        this.entityFacingMarks.delete(id);
      }
      this.layout();
      this.cameras.main.fadeIn(120, 5, 8, 9);
    });
  }

  private layout(): void {
    if (!worldEngine.hasState()) return;
    const room = worldEngine.getCurrentRoom();
    if (!room) return;
    this.updateOffsets(room);
    this.floorLabel.setText(room.name);
    this.redraw();
  }

  private updateOffsets(room: Room): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const totalW = room.width * TILE_PX;
    const totalH = room.height * TILE_PX;
    this.offsetX = Math.floor((W - totalW) / 2);
    this.offsetY = Math.floor((H - totalH) / 2);
  }

  private redraw(): void {
    if (!worldEngine.hasState()) return;
    const state = worldEngine.getState();
    const room = worldEngine.getCurrentRoom();
    if (!room) return;
    this.updateOffsets(room);

    this.tileLayer.clear();
    this.glyphLayer.clear();
    this.coneLayer.clear();
    this.overlayLayer.clear();

    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const tile = room.tiles[y * room.width + x];
        const visible = state.visibleTiles.has(`${x},${y}`);
        this.drawTile(tile, x, y, visible);
      }
    }

    // Hide all entity rects, then re-show only the ones in the current room.
    for (const [id, rect] of this.entityRects) {
      rect.setVisible(false);
      this.entityFacingMarks.get(id)?.setVisible(false);
    }
    for (const entity of state.entities.values()) {
      if (entity.status !== "ACTIVE") continue;
      if (entity.roomId !== room.id) continue;
      this.drawEntity(state, entity);
    }

    // Player.
    const ppx = this.offsetX + state.player.pos.x * TILE_PX + TILE_PX / 2;
    const ppy = this.offsetY + state.player.pos.y * TILE_PX + TILE_PX / 2;
    this.playerSprite.setPosition(ppx, ppy);
    this.placeFacingMark(this.playerFacingMark, ppx, ppy, state.player.facing);

    if (state.detained) {
      this.overlayLayer.fillStyle(0x4a0d0d, 0.45);
      this.overlayLayer.fillRect(0, 0, this.scale.width, this.scale.height);
    }
  }

  private drawTile(tile: Tile, x: number, y: number, visible: boolean): void {
    const px = this.offsetX + x * TILE_PX;
    const py = this.offsetY + y * TILE_PX;
    const colour = TILE_COLORS[tile.kind] ?? 0x222d33;
    this.tileLayer.fillStyle(colour, visible ? 1 : 0.32);
    this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
    this.tileLayer.lineStyle(1, 0x223035, visible ? 0.6 : 0.25);
    this.tileLayer.strokeRect(px, py, TILE_PX - 1, TILE_PX - 1);
    if (visible) this.drawGlyph(px + TILE_PX / 2, py + TILE_PX / 2, tile.kind);
  }

  private drawGlyph(cx: number, cy: number, kind: TileKind): void {
    const g = this.glyphLayer;
    g.lineStyle(2, 0xe6f0f2, 0.85);
    if (kind === "TERMINAL") {
      g.strokeRect(cx - 8, cy - 6, 16, 12);
    } else if (kind === "EXTRACTION_TERMINAL") {
      g.lineStyle(2, 0xc89adb, 0.9);
      g.strokeRect(cx - 8, cy - 6, 16, 12);
      g.fillStyle(0xc89adb, 0.5);
      g.fillRect(cx - 6, cy - 4, 12, 8);
    } else if (kind === "LIGHT_SOURCE") {
      g.fillStyle(0xfff0a8, 0.9);
      g.fillCircle(cx, cy, 4);
    } else if (kind === "DOOR_CLOSED") {
      g.fillStyle(0x9b7a4f, 1);
      g.fillRect(cx - 5, cy - 9, 10, 18);
    } else if (kind === "DOOR_OPEN") {
      g.lineStyle(2, 0x9b7a4f, 1);
      g.strokeRect(cx - 5, cy - 9, 10, 18);
    }
  }

  private drawEntity(
    state: ReturnType<typeof worldEngine.getState>,
    entity: Entity,
  ): void {
    const px = this.offsetX + entity.pos.x * TILE_PX + TILE_PX / 2;
    const py = this.offsetY + entity.pos.y * TILE_PX + TILE_PX / 2;
    let rect = this.entityRects.get(entity.id);
    const colour =
      entity.kind === "GUARD" ? 0xff7a6a :
        entity.kind === "SILICATE" ? 0x9adbe6 : 0xc8dbe6;
    if (!rect) {
      rect = this.add.rectangle(px, py, TILE_PX - 14, TILE_PX - 14, colour);
      rect.setStrokeStyle(2, 0xe6f0f2);
      rect.setDepth(4);
      this.entityRects.set(entity.id, rect);
    }
    rect.setPosition(px, py);
    rect.setFillStyle(colour);
    const visible = state.visibleTiles.has(`${entity.pos.x},${entity.pos.y}`);
    rect.setVisible(visible);

    let mark = this.entityFacingMarks.get(entity.id);
    if (!mark) {
      mark = this.add.triangle(px, py, 0, 0, -6, 8, 6, 8, 0xe6f0f2);
      mark.setDepth(5);
      this.entityFacingMarks.set(entity.id, mark);
    }
    this.placeFacingMark(mark, px, py, entity.facing);
    mark.setVisible(visible);

    if (entity.kind === "GUARD") {
      this.drawGuardCone(entity);
    }
  }

  private drawGuardCone(guard: Entity): void {
    const visible = guardSystem.visibleTiles(worldEngine.getState(), guard);
    const level = guard.alert?.level ?? "NORMAL";
    const colour = ALERT_COLORS[level];
    this.coneLayer.fillStyle(colour.fill, colour.alpha);
    for (const key of visible) {
      const [xs, ys] = key.split(",");
      const x = Number(xs);
      const y = Number(ys);
      const px = this.offsetX + x * TILE_PX;
      const py = this.offsetY + y * TILE_PX;
      this.coneLayer.fillRect(px + 2, py + 2, TILE_PX - 5, TILE_PX - 5);
    }
  }

  private placeFacingMark(
    mark: Phaser.GameObjects.Triangle,
    cx: number,
    cy: number,
    facing: Facing,
  ): void {
    const offset = TILE_PX / 2 - 6;
    if (facing === "north") {
      mark.setPosition(cx, cy - offset);
      mark.setRotation(Math.PI);
    } else if (facing === "south") {
      mark.setPosition(cx, cy + offset);
      mark.setRotation(0);
    } else if (facing === "east") {
      mark.setPosition(cx + offset, cy);
      mark.setRotation(-Math.PI / 2);
    } else {
      mark.setPosition(cx - offset, cy);
      mark.setRotation(Math.PI / 2);
    }
  }

  private flashExclamation(guardId: string): void {
    if (!worldEngine.hasState()) return;
    const state = worldEngine.getState();
    const guard = state.entities.get(guardId);
    if (!guard || guard.roomId !== state.player.roomId) return;
    const px = this.offsetX + guard.pos.x * TILE_PX + TILE_PX / 2;
    const py = this.offsetY + guard.pos.y * TILE_PX - 6;
    let mark = this.exclamationMarks.get(guardId);
    if (!mark) {
      mark = this.add.text(px, py, "!", {
        fontFamily: "Arial Black, sans-serif",
        fontSize: "28px",
        color: "#ff5050",
      });
      mark.setOrigin(0.5, 1);
      mark.setDepth(10);
      this.exclamationMarks.set(guardId, mark);
    }
    mark.setPosition(px, py);
    mark.setVisible(true);
    this.tweens.add({
      targets: mark,
      y: py - 18,
      alpha: 0,
      duration: 700,
      onComplete: () => {
        mark!.setVisible(false);
        mark!.setAlpha(1);
      },
    });
  }
}
