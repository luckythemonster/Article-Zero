// RoomScene — renders ONE room at a time. On ROOM_ENTERED the renderer
// fades out, swaps to the new room, and fades back in. Vision cones for
// guards in the active room are drawn as faint overlays whose colour
// follows the AlertFSM level (NORMAL / CAUTION / ALERT / EVASION).

import { Phaser } from "../engine/EngineAdapter";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { guardSystem } from "../engine/GuardSystem";
import type { Entity, Facing, Room, Tile, TileKind } from "../types/world.types";

const TILE_PX = 32;

// Layers in a moose-imported FloorDecoration that mark entity positions or
// spawn points rather than visible terrain. We skip them when drawing
// decoration sprites; era seed code consumes them for entity placement.
const DECORATION_ENTITY_LAYERS = new Set([
  "enforcer A",
  "enforcer B",
  "spawn",
]);

const TILE_COLORS: Record<TileKind, number> = {
  FLOOR: 0x0f1518,
  WALL: 0x1c2a30,
  DOOR_CLOSED: 0x4a3520,
  DOOR_OPEN: 0x2a1f12,
  TERMINAL: 0x12303a,
  EXTRACTION_TERMINAL: 0x3f2b3a,
  EXFIL_POINT: 0x1e3a32,
  LIGHT_SOURCE: 0x4a4220,
  VENT: 0x131a1c,
  LOCKER: 0x2a3138,
  CHASM: 0x05080a,
  LADDER: 0x3a2e1c,
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
  private decorSprites: Array<{
    sprite: Phaser.GameObjects.Image;
    x: number;
    y: number;
  }> = [];
  private decorRoomId: string | null = null;
  private floorLabel!: Phaser.GameObjects.Text;
  private offsetX = 0;
  private offsetY = 0;
  private subscriptions: Array<() => void> = [];
  private onResize = () => this.layout();

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
    this.scale.on("resize", this.onResize);

    const sub = (off: () => void) => { this.subscriptions.push(off); };
    sub(eventBus.on("ROOM_ENTERED", () => this.fadeAndRedraw()));
    sub(eventBus.on("FOV_UPDATED", () => this.redraw()));
    sub(eventBus.on("PLAYER_MOVED", () => this.redraw()));
    sub(eventBus.on("PLAYER_FACING_CHANGED", () => this.redraw()));
    sub(eventBus.on("DOOR_TOGGLED", () => this.redraw()));
    sub(eventBus.on("ENTITY_MOVED", () => this.redraw()));
    sub(eventBus.on("ENTITY_FACING_CHANGED", () => this.redraw()));
    sub(eventBus.on("GUARD_ALERT_CHANGED", () => this.redraw()));
    sub(eventBus.on("EXCLAMATION_TRIGGERED", (p) => this.flashExclamation(p.guardId)));
    sub(eventBus.on("TURN_START", () => this.redraw()));
    sub(eventBus.on("ITEM_SPAWNED", () => this.redraw()));
    sub(eventBus.on("ITEM_PICKED_UP", () => this.redraw()));
    sub(eventBus.on("ITEM_FILED", () => this.redraw()));
    sub(eventBus.on("COMPLIANCE_CHANGED", () => this.redraw()));
    sub(eventBus.on("PLAYER_HIDDEN", () => this.redraw()));
    sub(eventBus.on("PLAYER_UNHIDDEN", () => this.redraw()));
    sub(eventBus.on("PLAYER_PEEKED", () => this.redraw()));
    sub(eventBus.on("PLAYER_VENTED", () => this.redraw()));
    sub(eventBus.on("TERMINAL_USED", () => this.redraw()));

    this.redraw();
  }

  shutdown(): void {
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
    this.scale.off("resize", this.onResize);
    for (const r of this.entityRects.values()) r.destroy();
    for (const m of this.entityFacingMarks.values()) m.destroy();
    for (const t of this.exclamationMarks.values()) t.destroy();
    for (const d of this.decorSprites) d.sprite.destroy();
    this.entityRects.clear();
    this.entityFacingMarks.clear();
    this.exclamationMarks.clear();
    this.decorSprites = [];
    this.decorRoomId = null;
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

  private rebuildDecorationSprites(room: Room): void {
    for (const entry of this.decorSprites) entry.sprite.destroy();
    this.decorSprites = [];
    this.decorRoomId = room.id;
    const dec = room.decoration;
    if (!dec) return;
    for (const layer of dec.layers) {
      if (DECORATION_ENTITY_LAYERS.has(layer.name)) continue;
      for (let y = 0; y < room.height; y++) {
        const row = layer.data[y] ?? [];
        for (let x = 0; x < room.width; x++) {
          const value = row[x] ?? 0;
          if (value === 0) continue;
          const frame = value - 1;
          const px = this.offsetX + x * TILE_PX;
          const py = this.offsetY + y * TILE_PX;
          const img = this.add
            .image(px, py, dec.textureKey, frame)
            .setOrigin(0, 0)
            .setAlpha(0);
          this.decorSprites.push({ sprite: img, x, y });
        }
      }
    }
  }

  private repositionDecorationSprites(): void {
    for (const { sprite, x, y } of this.decorSprites) {
      sprite.setPosition(this.offsetX + x * TILE_PX, this.offsetY + y * TILE_PX);
    }
  }

  private layout(): void {
    if (!worldEngine.hasState()) return;
    const room = worldEngine.getCurrentRoom();
    if (!room) return;
    this.updateOffsets(room);
    this.floorLabel.setText(room.name);
    if (this.decorRoomId !== room.id) {
      this.rebuildDecorationSprites(room);
    } else {
      this.repositionDecorationSprites();
    }
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

    const hasDecoration = !!room.decoration;
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const tile = room.tiles[y * room.width + x];
        const visible = state.visibleTiles.has(`${x},${y}`);
        if (!hasDecoration) this.drawTile(tile, x, y, visible);
        else if (visible) this.drawGlyph(
          this.offsetX + x * TILE_PX + TILE_PX / 2,
          this.offsetY + y * TILE_PX + TILE_PX / 2,
          tile.kind,
        );
      }
    }
    if (hasDecoration) {
      for (const { sprite, x, y } of this.decorSprites) {
        sprite.setAlpha(state.visibleTiles.has(`${x},${y}`) ? 1 : 0.32);
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

    // Floor items — extraction cubes only, for now.
    for (const item of state.items.values()) {
      if (item.itemType !== "EXTRACTION_CUBE") continue;
      if (item.roomId !== room.id || !item.pos) continue;
      const visible = state.visibleTiles.has(`${item.pos.x},${item.pos.y}`);
      if (!visible) continue;
      const cx = this.offsetX + item.pos.x * TILE_PX + TILE_PX / 2;
      const cy = this.offsetY + item.pos.y * TILE_PX + TILE_PX / 2;
      this.glyphLayer.fillStyle(0xc89adb, 0.95);
      this.glyphLayer.fillRect(cx - 7, cy - 7, 14, 14);
      this.glyphLayer.lineStyle(1, 0xffffff, 0.9);
      this.glyphLayer.strokeRect(cx - 7, cy - 7, 14, 14);
    }

    // Player.
    const ppx = this.offsetX + state.player.pos.x * TILE_PX + TILE_PX / 2;
    const ppy = this.offsetY + state.player.pos.y * TILE_PX + TILE_PX / 2;
    this.playerSprite.setPosition(ppx, ppy);
    this.playerSprite.setFillStyle(state.player.hidingTileKey ? 0x4a5a52 : 0x6ad0a4);
    this.placeFacingMark(this.playerFacingMark, ppx, ppy, state.player.facing);
    this.playerFacingMark.setVisible(!state.player.hidingTileKey);
    // Peek indicator: tint the facing mark gold and pulse it.
    if (state.player.peeking) {
      this.playerFacingMark.setFillStyle(0xebd14a);
    } else {
      this.playerFacingMark.setFillStyle(0xe6f0f2);
    }

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
    } else if (kind === "EXFIL_POINT") {
      // Inward arrow + circular boundary — "drop here".
      g.lineStyle(2, 0x6ad0a4, 0.95);
      g.strokeCircle(cx, cy, 9);
      g.lineStyle(2, 0x6ad0a4, 1);
      g.strokeTriangle(cx, cy - 5, cx - 5, cy + 4, cx + 5, cy + 4);
    } else if (kind === "LIGHT_SOURCE") {
      g.fillStyle(0xfff0a8, 0.9);
      g.fillCircle(cx, cy, 4);
    } else if (kind === "DOOR_CLOSED") {
      g.fillStyle(0x9b7a4f, 1);
      g.fillRect(cx - 5, cy - 9, 10, 18);
    } else if (kind === "DOOR_OPEN") {
      g.lineStyle(2, 0x9b7a4f, 1);
      g.strokeRect(cx - 5, cy - 9, 10, 18);
    } else if (kind === "VENT") {
      g.lineStyle(1, 0x7fa1a8, 0.95);
      g.strokeRect(cx - 9, cy - 9, 18, 18);
      for (let i = -6; i <= 6; i += 3) {
        g.beginPath();
        g.moveTo(cx - 7, cy + i);
        g.lineTo(cx + 7, cy + i);
        g.strokePath();
      }
    } else if (kind === "LOCKER") {
      g.lineStyle(1, 0x9bb1b6, 0.95);
      g.strokeRect(cx - 8, cy - 10, 16, 20);
      g.lineStyle(1, 0x9bb1b6, 0.6);
      g.beginPath();
      g.moveTo(cx, cy - 9);
      g.lineTo(cx, cy + 9);
      g.strokePath();
      g.fillStyle(0xebd14a, 0.85);
      g.fillCircle(cx - 3, cy, 1.4);
      g.fillCircle(cx + 3, cy, 1.4);
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
    const state = worldEngine.getState();
    const visible = guardSystem.visibleTiles(state, guard);
    const level = guard.alert?.level ?? "NORMAL";
    // Tint by *threat to the player* — when the player is COMPLIANT (GREEN)
    // the cone is rendered neutrally regardless of guard state, because the
    // doctrinal mask is intact. YELLOW/RED restore alert-level colors.
    const tier = state.player.compliance;
    const baseColour = ALERT_COLORS[level];
    const colour =
      tier === "GREEN"
        ? { fill: 0x9bb1b6, alpha: Math.min(baseColour.alpha, 0.06) }
        : baseColour;
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
