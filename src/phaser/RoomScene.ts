// RoomScene — renders ONE room at a time. On ROOM_ENTERED the renderer
// fades out, swaps to the new room, and fades back in. Vision cones for
// guards in the active room are drawn as faint overlays whose colour
// follows the AlertFSM level (NORMAL / CAUTION / ALERT / EVASION).

import { Phaser } from "../engine/EngineAdapter";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { guardSystem } from "../engine/GuardSystem";
import { debugFlags } from "../engine/debugFlags";
import type { Entity, Facing, Room, Tile, TileKind } from "../types/world.types";
import { ITEM_METADATA } from "../data/items/itemMetadata";

const TILE_PX = 32;
const ELEVATION_PX_PER_STEP = 8;
// Player frames in the chars-art atlas are 64×64 source px (the body
// occupies the middle ~32 px of that frame, the rest is transparent
// padding). Rendering at 1.0 gives a 64-px world footprint = 2 tiles wide,
// with the visible body roughly 1 tile tall, sitting on the tile centre.
const CHAR_SPRITE_SCALE = 1.0;
// Pull the camera in so the world fills more of the 960×640 viewport.
const CAMERA_ZOOM = 1.5;

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
  LIGHT_SWITCH: 0x202830,
  VENT: 0x131a1c,
  LOCKER: 0x2a3138,
  CHASM: 0x05080a,
  LADDER: 0x3a2e1c,
  STAIRS: 0x2a221a,
  CHAIN_LINK_FENCE: 0x1a2226,
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
  private telegraphLayer!: Phaser.GameObjects.Graphics;
  private overlayLayer!: Phaser.GameObjects.Graphics;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private heldItemSprite!: Phaser.GameObjects.Image;
  private entityRects = new Map<string, Phaser.GameObjects.Rectangle>();
  private entityFacingMarks = new Map<string, Phaser.GameObjects.Triangle>();
  private exclamationMarks = new Map<string, Phaser.GameObjects.Text>();
  private decorSprites: Array<{
    sprite: Phaser.GameObjects.Image;
    x: number;
    y: number;
  }> = [];
  /** Cells covered by at least one decoration sprite. Used by `redraw` to
   *  fall back to `drawTile` for cells where the moose export has no
   *  backdrop art (e.g. NW-SMAC-01, where all painted layers are tile-mapped
   *  and `room.decoration.layers` ends up nearly empty). */
  private decoratedCells: Set<string> = new Set();
  private decorRoomId: string | null = null;
  private floorLabel!: Phaser.GameObjects.Text;
  private debugLayer!: Phaser.GameObjects.Graphics;
  private elevationTextPool: Phaser.GameObjects.Text[] = [];
  private subscriptions: Array<() => void> = [];
  private onResize = () => this.layout();
  /** 0..1 darkening factor driven by OXYGEN_TICK during the climax. */
  private oxygenDarken = 0;

  constructor() {
    super({ key: "RoomScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#050809");
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.tileLayer = this.add.graphics();
    this.glyphLayer = this.add.graphics();
    this.coneLayer = this.add.graphics();
    this.coneLayer.setDepth(2);
    this.telegraphLayer = this.add.graphics();
    this.telegraphLayer.setDepth(3);
    this.overlayLayer = this.add.graphics();
    this.overlayLayer.setDepth(20);
    // Detained red flash fills the viewport, not the world — keep it
    // glued to the camera.
    this.overlayLayer.setScrollFactor(0);

    this.playerSprite = this.add.sprite(0, 0, "chars-art", "rowanibarra/stand/south/01");
    this.playerSprite.setOrigin(0.5);
    this.playerSprite.setScale(CHAR_SPRITE_SCALE);
    this.playerSprite.setDepth(5);
    if (worldEngine.hasState()) {
      const pos = worldEngine.getState().player.pos;
      this.playerSprite.setPosition(pos.x * TILE_PX + TILE_PX / 2, pos.y * TILE_PX + TILE_PX / 2);
    }
    // Held-item overlay. Texture is swapped in redraw() per facing; hidden
    // when inventory is empty of renderable items.
    this.heldItemSprite = this.add.image(0, 0, "__DEFAULT");
    this.heldItemSprite.setDepth(7);
    this.heldItemSprite.setVisible(false);
    this.debugLayer = this.add.graphics();
    this.debugLayer.setDepth(25);

    this.cameras.main.startFollow(this.playerSprite, true, 0.18, 0.18);

    this.floorLabel = this.add.text(12, 8, "", {
      fontFamily: "Courier New, monospace",
      fontSize: "14px",
      color: "#9bb1b6",
    });
    this.floorLabel.setDepth(30);
    this.floorLabel.setScrollFactor(0);

    this.layout();
    this.scale.on("resize", this.onResize);

    const sub = (off: () => void) => { this.subscriptions.push(off); };
    sub(eventBus.on("ROOM_ENTERED", () => this.fadeAndRedraw()));
    sub(eventBus.on("FOV_UPDATED", () => this.redraw()));
    sub(eventBus.on("PLAYER_MOVED", () => this.redraw()));
    sub(eventBus.on("PLAYER_FACING_CHANGED", () => this.redraw()));
    sub(eventBus.on("DOOR_TOGGLED", () => this.redraw()));
    sub(eventBus.on("LIGHT_TOGGLED", () => this.redraw()));
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
    sub(eventBus.on("PLAYER_STANCE_CHANGED", () => this.redraw()));
    sub(eventBus.on("TERMINAL_USED", () => this.redraw()));
    sub(eventBus.on("OXYGEN_TICK", (p) => {
      const total = Math.max(1, p.totalSeconds);
      const elapsed = total - p.remainingSeconds;
      this.oxygenDarken = Math.max(0, Math.min(0.85, elapsed / total));
      this.redraw();
    }));
    sub(eventBus.on("CLIMAX_ESCAPED", () => {
      this.oxygenDarken = 0;
      this.redraw();
    }));
    sub(eventBus.on("PHASE_RESTART_REQUESTED", () => {
      this.oxygenDarken = 0;
      this.redraw();
    }));

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
    for (const t of this.elevationTextPool) t.destroy();
    this.elevationTextPool = [];
    this.entityRects.clear();
    this.entityFacingMarks.clear();
    this.exclamationMarks.clear();
    this.decorSprites = [];
    this.decorRoomId = null;
  }

  /** Draw a yellow line from every CAUTION-level enforcer in the current room
   *  to its `lastStimulus` tile — the radical-predictability telegraph. */
  private drawGuardTelegraphs(): void {
    this.telegraphLayer.clear();
    if (!worldEngine.hasState()) return;
    const state = worldEngine.getState();
    const room = worldEngine.getCurrentRoom();
    if (!room) return;
    const pulse = 1.0;
    for (const e of state.entities.values()) {
      if (e.kind !== "GUARD" || e.status !== "ACTIVE") continue;
      if (e.roomId !== room.id) continue;
      if (e.alert?.level !== "CAUTION") continue;
      const tgt = e.alert.lastStimulus;
      if (!tgt) continue;
      // Cross-room stimuli get telegraphed only on the room they happened
      // in; for the other side, the guard just orients toward the doorway.
      if (e.alert.lastStimulusRoom && e.alert.lastStimulusRoom !== room.id) continue;
      const x1 = e.pos.x * TILE_PX + TILE_PX / 2;
      const y1 = e.pos.y * TILE_PX + TILE_PX / 2;
      const x2 = tgt.x * TILE_PX + TILE_PX / 2;
      const y2 = tgt.y * TILE_PX + TILE_PX / 2;
      this.telegraphLayer.lineStyle(2, 0xebd14a, 0.7 * pulse);
      this.telegraphLayer.beginPath();
      this.telegraphLayer.moveTo(x1, y1);
      this.telegraphLayer.lineTo(x2, y2);
      this.telegraphLayer.strokePath();
      // Endpoint pip — marks the pathfind target.
      this.telegraphLayer.fillStyle(0xebd14a, pulse);
      this.telegraphLayer.fillCircle(x2, y2, 3);
    }
  }

  private drawDebugOverlays(): void {
    this.debugLayer.clear();
    // Hide pooled text by default; only show when showTileElevation is on.
    for (const t of this.elevationTextPool) t.setVisible(false);

    if (!debugFlags.showHitboxes && !debugFlags.showTileElevation) return;
    if (!worldEngine.hasState()) return;
    const room = worldEngine.getCurrentRoom();
    if (!room) return;

    if (debugFlags.showHitboxes) {
      this.debugLayer.lineStyle(1, 0xff5050, 0.6);
      for (let y = 0; y < room.height; y++) {
        for (let x = 0; x < room.width; x++) {
          const tile = room.tiles[y * room.width + x];
          if (!tile.solid) continue;
          this.debugLayer.strokeRect(x * TILE_PX, y * TILE_PX, TILE_PX - 1, TILE_PX - 1);
        }
      }
      // Player sprite rect.
      this.debugLayer.lineStyle(1, 0x6ad0a4, 0.9);
      const pw = this.playerSprite.displayWidth;
      const ph = this.playerSprite.displayHeight;
      this.debugLayer.strokeRect(
        this.playerSprite.x - pw / 2,
        this.playerSprite.y - ph / 2,
        pw,
        ph,
      );
    }

    if (debugFlags.showTileElevation) {
      let i = 0;
      for (let y = 0; y < room.height; y++) {
        for (let x = 0; x < room.width; x++) {
          const tile = room.tiles[y * room.width + x];
          if (tile.elevation === 0 && tile.kind !== "STAIRS") continue;
          let text = this.elevationTextPool[i];
          if (!text) {
            text = this.add.text(0, 0, "", {
              fontFamily: "Courier New, monospace",
              fontSize: "9px",
              color: "#ebd14a",
            });
            text.setDepth(26);
            this.elevationTextPool.push(text);
          }
          text.setText(String(tile.elevation));
          text.setPosition(x * TILE_PX + 2, y * TILE_PX + 2);
          text.setVisible(true);
          i++;
        }
      }
    }
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
      // Snap the sprite to the new room's player position so the fade-in
      // doesn't briefly flash from the old scroll position.
      if (worldEngine.hasState()) {
        const pos = worldEngine.getState().player.pos;
        this.playerSprite.setPosition(
          pos.x * TILE_PX + TILE_PX / 2,
          pos.y * TILE_PX + TILE_PX / 2,
        );
      }
      this.cameras.main.centerOn(this.playerSprite.x, this.playerSprite.y);
      this.cameras.main.fadeIn(120, 5, 8, 9);
    });
  }

  private rebuildDecorationSprites(room: Room): void {
    for (const entry of this.decorSprites) entry.sprite.destroy();
    this.decorSprites = [];
    this.decoratedCells = new Set();
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
          const px = x * TILE_PX;
          const tileElev = room.tiles[y * room.width + x]?.elevation ?? 0;
          const py = y * TILE_PX - tileElev * ELEVATION_PX_PER_STEP;
          const img = this.add
            .image(px, py, dec.textureKey, frame)
            .setOrigin(0, 0)
            .setAlpha(0);
          this.decorSprites.push({ sprite: img, x, y });
          this.decoratedCells.add(`${x},${y}`);
        }
      }
    }
  }

  private layout(): void {
    if (!worldEngine.hasState()) return;
    const room = worldEngine.getCurrentRoom();
    if (!room) return;
    // Camera scrolls within the room; clamps at the edges so the void
    // beyond the map never enters frame.
    this.cameras.main.setBounds(0, 0, room.width * TILE_PX, room.height * TILE_PX);
    this.floorLabel.setText(room.name);
    if (this.decorRoomId !== room.id) {
      this.rebuildDecorationSprites(room);
    }
    this.redraw();
  }

  private redraw(): void {
    if (!worldEngine.hasState()) return;
    const state = worldEngine.getState();
    const room = worldEngine.getCurrentRoom();
    if (!room) return;

    this.tileLayer.clear();
    this.glyphLayer.clear();
    this.coneLayer.clear();
    this.telegraphLayer.clear();
    this.overlayLayer.clear();

    const hasDecoration = !!room.decoration;
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const tile = room.tiles[y * room.width + x];
        const key = `${x},${y}`;
        const visible = state.visibleTiles.has(key);
        // When decoration is declared but this cell isn't covered by a
        // backdrop sprite (common for moose exports whose painted layers
        // are all tile-mapped — see `decorationLayersFor`), fall back to
        // the tile rectangle so WALL/FLOOR/LADDER/STAIRS cells still show
        // up under FOV.
        const cellDecorated = hasDecoration && this.decoratedCells.has(key);
        if (!cellDecorated) {
          this.drawTile(tile, x, y, visible);
        } else if (visible) {
          this.drawGlyph(
            x * TILE_PX + TILE_PX / 2,
            y * TILE_PX + TILE_PX / 2,
            tile,
          );
        }
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

    // Floor items — draw a colored placeholder square for every item type.
    // When real sprites ship, replace the fillRect with a sprite draw here.
    for (const item of state.items.values()) {
      if (item.roomId !== room.id || !item.pos) continue;
      const visible = state.visibleTiles.has(`${item.pos.x},${item.pos.y}`);
      if (!visible) continue;
      const meta = ITEM_METADATA[item.itemType];
      const color = meta?.placeholderColor ?? 0x888888;
      const cx = item.pos.x * TILE_PX + TILE_PX / 2;
      const cy = item.pos.y * TILE_PX + TILE_PX / 2;
      this.glyphLayer.fillStyle(color, 0.95);
      this.glyphLayer.fillRect(cx - 7, cy - 7, 14, 14);
      this.glyphLayer.lineStyle(1, 0xffffff, 0.9);
      this.glyphLayer.strokeRect(cx - 7, cy - 7, 14, 14);
    }

    // Player. Position is driven by WorldState; redraw is the authoritative
    // writer. Elevation offset applied on top for stair tiles.
    const here = room.tiles[state.player.pos.y * room.width + state.player.pos.x];
    const elev = here?.elevation ?? 0;
    const playerCx = state.player.pos.x * TILE_PX + TILE_PX / 2;
    const playerCy = state.player.pos.y * TILE_PX + TILE_PX / 2 - elev * ELEVATION_PX_PER_STEP;
    this.playerSprite.setPosition(playerCx, playerCy);
    this.playerSprite.setVisible(!state.player.hidingTileKey);
    if (state.player.hidingTileKey) {
      this.playerSprite.setTint(0x6a6a6a);
    } else if (state.player.peeking) {
      // Peek indicator: gold tint, same channel previously driven by the
      // discarded facing triangle.
      this.playerSprite.setTint(0xebd14a);
    } else {
      this.playerSprite.clearTint();
    }

    // Pick the right anim from facing + stance + flashlight + whether the
    // player moved this turn. Crouched wins over flashlight (no
    // flashlight_crouched_* art exists); RUN only has a base-state runcycle.
    const moving = state.player.lastMoveTurn === state.turn;
    const dir = state.player.facing;
    const prefix =
      state.player.stance === "SNEAK" ? "crouched_" :
        state.player.flashlightOn ? "flashlight_" :
          "";
    const motion = moving
      ? (state.player.stance === "RUN" && !state.player.flashlightOn ? "runcycle" : "walkcycle")
      : "stand";
    const animKey = `rowanibarra_${prefix}${motion}_${dir}`;
    if (
      this.anims.exists(animKey) &&
      this.playerSprite.anims.currentAnim?.key !== animKey
    ) {
      this.playerSprite.play(animKey);
    }

    // Held-item: bypass_drive renders above the player when in inventory.
    const holdsBypass = state.player.inventory.some(
      (i) => i.itemType === "BYPASS_DRIVE",
    );
    if (holdsBypass && !state.player.hidingTileKey) {
      const texKey = `bypass_drive_${state.player.facing}`;
      if (this.textures.exists(texKey)) {
        this.heldItemSprite.setTexture(texKey);
        // Item PNGs are native 32×32; render at full size so the held item
        // reads at ≈half the player's new ~64-px height. Offset above the
        // player's head matches the taller character footprint.
        this.heldItemSprite.setPosition(playerCx, playerCy - 32);
        this.heldItemSprite.setScale(1.0);
        this.heldItemSprite.setVisible(true);
      } else {
        this.heldItemSprite.setVisible(false);
      }
    } else {
      this.heldItemSprite.setVisible(false);
    }

    // Audit lockdown failure visual — keep a faint red wash so the player
    // can see the world dim under the React `<AuditLockdown/>` overlay that
    // narrates the actual "AUDIT FLAG RAISED / O2 PURGING" text.
    // overlayLayer has scrollFactor 0 but its fillRect is still in world
    // units — divide by camera zoom so the wash covers exactly the viewport.
    const zoom = this.cameras.main.zoom;
    const vw = this.scale.width / zoom;
    const vh = this.scale.height / zoom;
    if (state.detained) {
      this.overlayLayer.fillStyle(0x1a0404, 0.55);
      this.overlayLayer.fillRect(0, 0, vw, vh);
    }
    // Climax oxygen darken — independent of detention.
    if (this.oxygenDarken > 0) {
      this.overlayLayer.fillStyle(0x000000, this.oxygenDarken);
      this.overlayLayer.fillRect(0, 0, vw, vh);
    }

    this.drawGuardTelegraphs();
    this.drawDebugOverlays();
  }

  private drawTile(tile: Tile, x: number, y: number, visible: boolean): void {
    const px = x * TILE_PX;
    const py = y * TILE_PX;
    const colour = TILE_COLORS[tile.kind] ?? 0x222d33;
    this.tileLayer.fillStyle(colour, visible ? 1 : 0.32);
    this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
    this.tileLayer.lineStyle(1, 0x223035, visible ? 0.6 : 0.25);
    this.tileLayer.strokeRect(px, py, TILE_PX - 1, TILE_PX - 1);
    if (visible) this.drawGlyph(px + TILE_PX / 2, py + TILE_PX / 2, tile);
  }

  private drawGlyph(cx: number, cy: number, tile: Tile): void {
    const kind = tile.kind;
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
      // Bright filled circle when on; dim outline only when off.
      const on = tile.lightOn !== false;
      if (on) {
        g.fillStyle(0xfff0a8, 0.9);
        g.fillCircle(cx, cy, 4);
      } else {
        g.lineStyle(1, 0xfff0a8, 0.35);
        g.strokeCircle(cx, cy, 4);
      }
    } else if (kind === "LIGHT_SWITCH") {
      // Wall plate: narrow vertical rectangle with a small toggle dot.
      g.lineStyle(1, 0x9bb1b6, 0.85);
      g.strokeRect(cx - 4, cy - 8, 8, 16);
      g.fillStyle(0xebd14a, 0.85);
      g.fillCircle(cx, cy, 1.6);
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
    } else if (kind === "LADDER") {
      // Twin rails + three rungs — signals "press E to climb."
      g.lineStyle(2, 0xc8a878, 0.95);
      g.beginPath();
      g.moveTo(cx - 5, cy - 9);
      g.lineTo(cx - 5, cy + 9);
      g.moveTo(cx + 5, cy - 9);
      g.lineTo(cx + 5, cy + 9);
      g.strokePath();
      for (let ry = -6; ry <= 6; ry += 6) {
        g.beginPath();
        g.moveTo(cx - 5, cy + ry);
        g.lineTo(cx + 5, cy + ry);
        g.strokePath();
      }
    } else if (kind === "CHAIN_LINK_FENCE") {
      // Diamond cross-hatch bounded to the tile — reads as a see-through
      // barrier (solid but not opaque).
      g.lineStyle(1, 0x8aa0a8, 0.7);
      const r = 9;
      g.strokeRect(cx - r, cy - r, r * 2, r * 2);
      g.beginPath();
      g.moveTo(cx - r, cy - r); g.lineTo(cx + r, cy + r);
      g.moveTo(cx - r, cy + r); g.lineTo(cx + r, cy - r);
      g.moveTo(cx - r, cy); g.lineTo(cx, cy - r);
      g.moveTo(cx, cy - r); g.lineTo(cx + r, cy);
      g.moveTo(cx + r, cy); g.lineTo(cx, cy + r);
      g.moveTo(cx, cy + r); g.lineTo(cx - r, cy);
      g.strokePath();
    }
  }

  private drawEntity(
    state: ReturnType<typeof worldEngine.getState>,
    entity: Entity,
  ): void {
    const room = state.rooms.get(entity.roomId);
    const tileElev = room?.tiles[entity.pos.y * room.width + entity.pos.x]?.elevation ?? 0;
    const px = entity.pos.x * TILE_PX + TILE_PX / 2;
    const py = entity.pos.y * TILE_PX + TILE_PX / 2 - tileElev * ELEVATION_PX_PER_STEP;
    let rect = this.entityRects.get(entity.id);
    // VENT-4 (Environmental Optimizer) gets the deep-maroon palette of its
    // placeholder atlas frame; other silicates stay on the cyan baseline.
    const colour =
      entity.kind === "GUARD" ? 0xff7a6a :
        entity.kind === "SILICATE"
          ? entity.id === "VENT-4" ? 0x9b2c2c : 0x9adbe6
          : 0xc8dbe6;
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
      const px = x * TILE_PX;
      const py = y * TILE_PX;
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
