// RoomScene — renders ONE room at a time. On ROOM_ENTERED the renderer
// fades out, swaps to the new room, and fades back in. Vision cones for
// guards in the active room are drawn as faint overlays whose colour
// follows the AlertFSM level (NORMAL / CAUTION / ALERT / EVASION).
//
// World content lives inside `worldContainer`, which we scale + translate
// to keep the player centered with a zoom that scales with the player's
// effective FOV radius. UI elements (floor label, detained overlay) live
// outside the container so they stay fixed-position and fixed-scale.

import { Phaser } from "../engine/EngineAdapter";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { guardSystem } from "../engine/GuardSystem";
import { getEffectivePlayerRadius } from "../engine/VisionCone";
import type { Entity, Facing, Room, Tile, TileKind, WorldState } from "../types/world.types";

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
};

const ALERT_COLORS: Record<string, { fill: number; alpha: number }> = {
  NORMAL: { fill: 0x9bb1b6, alpha: 0.06 },
  CAUTION: { fill: 0xebd14a, alpha: 0.18 },
  ALERT: { fill: 0xff5050, alpha: 0.28 },
  EVASION: { fill: 0xff9577, alpha: 0.14 },
};

const EXPLORED_ALPHA = 0.28;
const ZOOM_FILL_FRACTION = 0.85;
const ZOOM_MIN = 1.0;
const ZOOM_MAX = 6.0;

type Vis = "VISIBLE" | "EXPLORED" | "UNSEEN";

export class RoomScene extends Phaser.Scene {
  private worldContainer!: Phaser.GameObjects.Container;
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

  constructor() {
    super({ key: "RoomScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#050809");

    this.worldContainer = this.add.container(0, 0);

    this.tileLayer = this.add.graphics();
    this.glyphLayer = this.add.graphics();
    this.coneLayer = this.add.graphics();
    this.coneLayer.setDepth(2);
    this.worldContainer.add([this.tileLayer, this.glyphLayer, this.coneLayer]);

    this.playerSprite = this.add.rectangle(0, 0, TILE_PX - 12, TILE_PX - 12, 0x6ad0a4);
    this.playerSprite.setStrokeStyle(2, 0xe6f0f2);
    this.playerSprite.setDepth(5);
    this.playerFacingMark = this.add.triangle(0, 0, 0, 0, -6, 8, 6, 8, 0xe6f0f2);
    this.playerFacingMark.setDepth(6);
    this.worldContainer.add([this.playerSprite, this.playerFacingMark]);

    // UI layer — outside the container so it stays fixed.
    this.overlayLayer = this.add.graphics();
    this.overlayLayer.setDepth(20);
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
    eventBus.on("ITEM_SPAWNED", () => this.redraw());
    eventBus.on("ITEM_PICKED_UP", () => this.redraw());
    eventBus.on("ITEM_FILED", () => this.redraw());
    eventBus.on("COMPLIANCE_CHANGED", () => this.redraw());
    eventBus.on("PLAYER_HIDDEN", () => this.redraw());
    eventBus.on("PLAYER_UNHIDDEN", () => this.redraw());
    eventBus.on("PLAYER_PEEKED", () => this.redraw());
    eventBus.on("PLAYER_VENTED", () => this.redraw());
    eventBus.on("TERMINAL_USED", () => this.redraw());
    eventBus.on("FLASHLIGHT_TOGGLED", () => this.redraw());
    eventBus.on("AMBIENT_LIGHT_CHANGED", () => this.redraw());

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
          const img = this.add
            .image(x * TILE_PX, y * TILE_PX, dec.textureKey, frame)
            .setOrigin(0, 0)
            .setAlpha(0);
          this.worldContainer.add(img);
          this.decorSprites.push({ sprite: img, x, y });
        }
      }
    }
  }

  private layout(): void {
    if (!worldEngine.hasState()) return;
    const room = worldEngine.getCurrentRoom();
    if (!room) return;
    this.floorLabel.setText(room.name);
    if (this.decorRoomId !== room.id) {
      this.rebuildDecorationSprites(room);
    }
    this.redraw();
  }

  /** Pick a zoom that fits the player's current FOV radius into ~85% of the
   *  smaller screen dimension, then center the world container on the player. */
  private updateCamera(state: WorldState, room: Room): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const ambient = room.ambientLight;
    const baseRadius = getEffectivePlayerRadius(ambient, state.player.flashlightOn);
    const peekBonus = state.player.peeking ? 2 : 0;
    const hidingShrink = state.player.hidingTileKey ? 1 : 0;
    const radius = Math.max(1, baseRadius + peekBonus - hidingShrink);
    const visibleDiameterPx = (radius * 2 + 1) * TILE_PX;
    const minDim = Math.min(W, H);
    let zoom = (minDim * ZOOM_FILL_FRACTION) / visibleDiameterPx;
    if (!Number.isFinite(zoom) || zoom < ZOOM_MIN) zoom = ZOOM_MIN;
    if (zoom > ZOOM_MAX) zoom = ZOOM_MAX;
    const playerWX = state.player.pos.x * TILE_PX + TILE_PX / 2;
    const playerWY = state.player.pos.y * TILE_PX + TILE_PX / 2;
    this.worldContainer.setScale(zoom);
    this.worldContainer.setPosition(W / 2 - playerWX * zoom, H / 2 - playerWY * zoom);
  }

  private visAt(state: WorldState, roomId: string, x: number, y: number): Vis {
    const key = `${x},${y}`;
    if (state.visibleTiles.has(key)) return "VISIBLE";
    if (state.exploredTiles.get(roomId)?.has(key)) return "EXPLORED";
    return "UNSEEN";
  }

  private redraw(): void {
    if (!worldEngine.hasState()) return;
    const state = worldEngine.getState();
    const room = worldEngine.getCurrentRoom();
    if (!room) return;

    this.updateCamera(state, room);

    this.tileLayer.clear();
    this.glyphLayer.clear();
    this.coneLayer.clear();
    this.overlayLayer.clear();

    const hasDecoration = !!room.decoration;
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const tile = room.tiles[y * room.width + x];
        const v = this.visAt(state, room.id, x, y);
        if (!hasDecoration) this.drawTile(tile, x, y, v);
        else if (v === "VISIBLE") this.drawGlyph(
          x * TILE_PX + TILE_PX / 2,
          y * TILE_PX + TILE_PX / 2,
          tile.kind,
        );
      }
    }
    if (hasDecoration) {
      for (const { sprite, x, y } of this.decorSprites) {
        const v = this.visAt(state, room.id, x, y);
        sprite.setAlpha(v === "VISIBLE" ? 1 : v === "EXPLORED" ? EXPLORED_ALPHA : 0);
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

    // Floor items — extraction cubes only, for now. Hidden in fog (no
    // peeking-at-cubes through the explored memory layer).
    for (const item of state.items.values()) {
      if (item.itemType !== "EXTRACTION_CUBE") continue;
      if (item.roomId !== room.id || !item.pos) continue;
      if (!state.visibleTiles.has(`${item.pos.x},${item.pos.y}`)) continue;
      const cx = item.pos.x * TILE_PX + TILE_PX / 2;
      const cy = item.pos.y * TILE_PX + TILE_PX / 2;
      this.glyphLayer.fillStyle(0xc89adb, 0.95);
      this.glyphLayer.fillRect(cx - 7, cy - 7, 14, 14);
      this.glyphLayer.lineStyle(1, 0xffffff, 0.9);
      this.glyphLayer.strokeRect(cx - 7, cy - 7, 14, 14);
    }

    // Player.
    const ppx = state.player.pos.x * TILE_PX + TILE_PX / 2;
    const ppy = state.player.pos.y * TILE_PX + TILE_PX / 2;
    this.playerSprite.setPosition(ppx, ppy);
    this.playerSprite.setFillStyle(state.player.hidingTileKey ? 0x4a5a52 : 0x6ad0a4);
    this.placeFacingMark(this.playerFacingMark, ppx, ppy, state.player.facing);
    this.playerFacingMark.setVisible(!state.player.hidingTileKey);
    this.playerFacingMark.setFillStyle(state.player.peeking ? 0xebd14a : 0xe6f0f2);

    if (state.detained) {
      this.overlayLayer.fillStyle(0x4a0d0d, 0.45);
      this.overlayLayer.fillRect(0, 0, this.scale.width, this.scale.height);
    }
  }

  private drawTile(tile: Tile, x: number, y: number, v: Vis): void {
    if (v === "UNSEEN") return;
    const px = x * TILE_PX;
    const py = y * TILE_PX;
    const colour = TILE_COLORS[tile.kind] ?? 0x222d33;
    const fillAlpha = v === "VISIBLE" ? 1 : EXPLORED_ALPHA;
    const strokeAlpha = v === "VISIBLE" ? 0.6 : 0.18;
    this.tileLayer.fillStyle(colour, fillAlpha);
    this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
    this.tileLayer.lineStyle(1, 0x223035, strokeAlpha);
    this.tileLayer.strokeRect(px, py, TILE_PX - 1, TILE_PX - 1);
    if (v === "VISIBLE") this.drawGlyph(px + TILE_PX / 2, py + TILE_PX / 2, tile.kind);
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

  private drawEntity(state: WorldState, entity: Entity): void {
    const px = entity.pos.x * TILE_PX + TILE_PX / 2;
    const py = entity.pos.y * TILE_PX + TILE_PX / 2;
    let rect = this.entityRects.get(entity.id);
    const colour =
      entity.kind === "GUARD" ? 0xff7a6a :
        entity.kind === "SILICATE" ? 0x9adbe6 : 0xc8dbe6;
    if (!rect) {
      rect = this.add.rectangle(px, py, TILE_PX - 14, TILE_PX - 14, colour);
      rect.setStrokeStyle(2, 0xe6f0f2);
      rect.setDepth(4);
      this.worldContainer.add(rect);
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
      this.worldContainer.add(mark);
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
    // Don't telegraph an unseen guard's vision cone.
    if (!state.visibleTiles.has(`${guard.pos.x},${guard.pos.y}`)) return;
    const visible = guardSystem.visibleTiles(state, guard);
    const level = guard.alert?.level ?? "NORMAL";
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
      this.coneLayer.fillRect(x * TILE_PX + 2, y * TILE_PX + 2, TILE_PX - 5, TILE_PX - 5);
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
    const px = guard.pos.x * TILE_PX + TILE_PX / 2;
    const py = guard.pos.y * TILE_PX - 6;
    let mark = this.exclamationMarks.get(guardId);
    if (!mark) {
      mark = this.add.text(px, py, "!", {
        fontFamily: "Arial Black, sans-serif",
        fontSize: "28px",
        color: "#ff5050",
      });
      mark.setOrigin(0.5, 1);
      mark.setDepth(10);
      this.worldContainer.add(mark);
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
