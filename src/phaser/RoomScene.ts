// RoomScene — renders ONE room at a time. On ROOM_ENTERED the renderer
// fades out, swaps to the new room, and fades back in. Vision cones for
// enforcers in the active room are drawn as faint overlays whose colour
// follows the AlertFSM level (NORMAL / CAUTION / ALERT / EVASION).

import { Phaser } from "../engine/EngineAdapter";
import { eventBus, type EventScope } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { enforcerSystem } from "../engine/EnforcerSystem";
import { debugFlags } from "../engine/debugFlags";
import { useTargetingStore } from "../state/useTargetingStore";
import type { Entity, Facing, ItemType, Room, Tile, TileKind, Vec2, WorldState } from "../types/world.types";
import { roomTileKey } from "../types/world.types";
import { atmosphericsField } from "../engine/AtmosphericsField";
import { ITEM_METADATA } from "../data/items/itemMetadata";
import {
  DEFAULT_DETONATION_FX,
  getVfxEffect,
  ITEM_DETONATION_FX,
} from "../data/vfx/registry";

const TILE_PX = 32;
const ELEVATION_PX_PER_STEP = 8;
// Character frames in the chars-art atlas carry a lot of transparent padding
// around the body, so scaling by the raw frame size leaves the visible body
// tiny. Instead we measure the non-transparent bounding box of a reference
// frame and scale so the *visible* body spans a target number of tiles.
// CHAR_VISIBLE_TILES = 1.5 → the visible character is ~48 px (1.5 tiles) tall.
const CHAR_VISIBLE_TILES = 1.5;
// Non-character props are sized by raw frame width (their art has little
// padding): drones keep the old baseline, cameras read as small fixtures.
const DRONE_FOOTPRINT_TILES = 1.5;
const CAMERA_FOOTPRINT_TILES = 1;

const PROP_SLUGS = new Set(["securitydrone", "securitycamera"]);

// Characters render this many pixels below their tile centre, so the feet sit
// a touch lower on the tile rather than dead-centre. Props are unaffected.
const CHAR_Y_OFFSET_PX = 12;

// Raw-frame-width footprint (in tiles) for a prop slug.
function propFootprintTiles(slug: string): number {
  return slug === "securitycamera" ? CAMERA_FOOTPRINT_TILES : DRONE_FOOTPRINT_TILES;
}

// Non-transparent bounding box of an atlas frame, in frame-local pixels,
// cached per frame key. `fw`/`fh` are the full frame dimensions. Returns null
// for an all-transparent (or unreadable) frame.
type VisBounds = { x: number; y: number; w: number; h: number; fw: number; fh: number };
const frameVisBoundsCache = new Map<string, VisBounds | null>();

function frameVisibleBounds(
  scene: Phaser.Scene, textureKey: string, frameKey: string,
): VisBounds | null {
  const cacheKey = `${textureKey}/${frameKey}`;
  const cached = frameVisBoundsCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const tex = scene.textures.get(textureKey);
  const frame = tex.get(frameKey);
  const fw = frame.cutWidth;
  const fh = frame.cutHeight;
  const cv = document.createElement("canvas");
  cv.width = fw;
  cv.height = fh;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  let result: VisBounds | null = null;
  if (ctx) {
    ctx.drawImage(
      tex.getSourceImage(0) as CanvasImageSource,
      frame.cutX, frame.cutY, fw, fh, 0, 0, fw, fh,
    );
    const data = ctx.getImageData(0, 0, fw, fh).data;
    let minX = fw, minY = fh, maxX = -1, maxY = -1;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        if (data[(y * fw + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0) result = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, fw, fh };
  }
  frameVisBoundsCache.set(cacheKey, result);
  return result;
}

// Scale a character sprite so its visible body height spans `targetTiles`
// tiles, and set its origin to the bottom-centre of the visible body so the
// tile coordinate lands at the character's feet. Falls back to a frame-width
// footprint with a bottom origin if the frame can't be measured.
function fitCharacterSprite(
  sprite: Phaser.GameObjects.Sprite, scene: Phaser.Scene,
  textureKey: string, refFrameKey: string, targetTiles: number,
): void {
  const b = frameVisibleBounds(scene, textureKey, refFrameKey);
  if (!b) {
    sprite.setOrigin(0.5, 1);
    sprite.setScale((targetTiles * TILE_PX) / sprite.width);
    return;
  }
  sprite.setOrigin((b.x + b.w / 2) / b.fw, (b.y + b.h) / b.fh);
  sprite.setScale((targetTiles * TILE_PX) / b.h);
}
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
  LIGHT_SOURCE: 0x0f1518,
  LIGHT_SWITCH: 0x202830,
  VENT: 0x131a1c,
  LOCKER: 0x2a3138,
  ITEM_CHEST: 0x6b4a2f,
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
  private atmosphereLayer!: Phaser.GameObjects.Graphics;
  private glyphLayer!: Phaser.GameObjects.Graphics;
  private coneLayer!: Phaser.GameObjects.Graphics;
  private telegraphLayer!: Phaser.GameObjects.Graphics;
  private overlayLayer!: Phaser.GameObjects.Graphics;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private heldItemSprite!: Phaser.GameObjects.Image;
  private interactText!: Phaser.GameObjects.Text;
  private entityRects = new Map<string, Phaser.GameObjects.Rectangle>();
  private entitySprites = new Map<string, Phaser.GameObjects.Sprite>();
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
  private targetingLayer!: Phaser.GameObjects.Graphics;
  // All EventBus + store subscriptions for this scene's lifetime live in one
  // scope, created in create() and torn down wholesale in shutdown(). No manual
  // per-handler unsubscribe bookkeeping — see EventBus.createScope().
  private scope: EventScope | null = null;
  private elevationTextPool: Phaser.GameObjects.Text[] = [];
  private onResize = () => this.layout();
  /** 0..1 darkening factor driven by OXYGEN_TICK during the climax. */
  private oxygenDarken = 0;
  /** 0..1 hazy white wash driven by PLAYER_BLINDED (CDN-7 chemical irritant). */
  private blindnessHaze = 0;

  constructor() {
    super({ key: "RoomScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#050809");
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.tileLayer = this.add.graphics();
    this.atmosphereLayer = this.add.graphics();
    this.atmosphereLayer.setDepth(1.5);
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
    fitCharacterSprite(
      this.playerSprite, this, "chars-art", "rowanibarra/stand/south/01", CHAR_VISIBLE_TILES,
    );
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
    this.targetingLayer = this.add.graphics();
    this.targetingLayer.setDepth(15);

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

    this.interactText = this.add.text(0, 0, "[E] INTERACT", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#00ffff", // Teal color
      stroke: "#000",
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(2000).setVisible(false);

    this.tweens.add({
      targets: this.interactText,
      alpha: 0.2,
      yoyo: true,
      repeat: -1,
      duration: 800
    });


    // Scoped subscriptions — every on()/add() here is auto-removed by the
    // single scope.dispose() in shutdown(), so there's no per-handler cleanup
    // to keep in sync when this list grows.
    const scope = eventBus.createScope();
    this.scope = scope;
    scope.on("ROOM_ENTERED", () => this.fadeAndRedraw());
    scope.on("FOV_UPDATED", () => this.redraw());
    scope.on("PLAYER_MOVED", () => this.redraw());
    scope.on("PLAYER_FACING_CHANGED", () => this.redraw());
    scope.on("DOOR_TOGGLED", () => this.redraw());
    scope.on("LIGHT_TOGGLED", () => this.redraw());
    scope.on("ENTITY_MOVED", () => this.redraw());
    scope.on("ENTITY_FACING_CHANGED", () => this.redraw());
    scope.on("ENFORCER_ALERT_CHANGED", () => this.redraw());
    scope.on("EXCLAMATION_TRIGGERED", (p) => this.flashExclamation(p.enforcerId));
    scope.on("TURN_START", () => this.redraw());
    scope.on("ITEM_SPAWNED", () => this.redraw());
    scope.on("ITEM_PICKED_UP", () => this.redraw());
    scope.on("CHEST_OPENED", () => this.redraw());
    scope.on("ITEM_FILED", () => this.redraw());
    scope.on("COMPLIANCE_CHANGED", () => this.redraw());
    scope.on("PLAYER_HIDDEN", () => this.redraw());
    scope.on("PLAYER_UNHIDDEN", () => this.redraw());
    scope.on("PLAYER_PEEKED", () => this.redraw());
    scope.on("PLAYER_VENTED", () => this.redraw());
    scope.on("PLAYER_STANCE_CHANGED", () => this.redraw());
    scope.on("TERMINAL_USED", () => this.redraw());
    scope.on("OXYGEN_TICK", (p) => {
      const total = Math.max(1, p.totalSeconds);
      const elapsed = total - p.remainingSeconds;
      this.oxygenDarken = Math.max(0, Math.min(0.85, elapsed / total));
      this.redraw();
    });
    scope.on("CLIMAX_ESCAPED", () => {
      this.oxygenDarken = 0;
      this.blindnessHaze = 0;
      this.redraw();
    });
    scope.on("PHASE_RESTART_REQUESTED", () => {
      this.oxygenDarken = 0;
      this.blindnessHaze = 0;
      this.redraw();
    });
    scope.on("PLAYER_BLINDED", () => {
      this.blindnessHaze = 0.55;
      this.redraw();
    });
    scope.on("EFFECT_EXPIRED", (p) => {
      if (p.effect === "blindness") {
        this.blindnessHaze = 0;
        this.redraw();
      }
    });
    scope.on("CDN7_ANCHORED", () => this.redraw());
    scope.on("CDN7_RELEASED", () => this.redraw());
    scope.on("ENTITY_STATUS_CHANGED", () => this.redraw());
    scope.on("ITEM_DETONATED", (p) => this.playDetonation(p));
    scope.on("ROOM_ATMOSPHERE_CHANGED", () => this.redraw());
    scope.on("HVAC_ZONE_SET", () => this.redraw());

    // Targeting store drives cursor/AoE preview redraws. Zustand's subscribe
    // returns an unsubscribe fn; hand it to the scope so it's disposed too.
    scope.add(useTargetingStore.subscribe(() => this.redraw()));

    // Tap-to-place cursor while aiming a thrown item (touch parity with WASD).
    // getWorldPoint already accounts for camera zoom + follow offset.
    const onPointerDown = (pointer: Phaser.Input.Pointer) => {
      const tgt = useTargetingStore.getState();
      if (!tgt.active) return;
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tx = Math.floor(wp.x / TILE_PX);
      const ty = Math.floor(wp.y / TILE_PX);
      tgt.setCursor({ x: tx, y: ty });
    };
    this.input.on("pointerdown", onPointerDown);
    scope.add(() => this.input.off("pointerdown", onPointerDown));

    this.redraw();
  }

  shutdown(): void {
    // Called by Phaser when game.destroy(true) runs (see PhaserCanvas teardown,
    // which owns the overall order: listeners → game.destroy → store reset).
    // 1. Detach every bus + store subscription this scene registered (one call).
    this.scope?.dispose();
    this.scope = null;
    this.scale.off("resize", this.onResize);
    // 2. Destroy all owned graphics/sprites so Phaser releases their GPU handles.
    for (const r of this.entityRects.values()) r.destroy();
    for (const s of this.entitySprites.values()) s.destroy();
    for (const m of this.entityFacingMarks.values()) m.destroy();
    for (const t of this.exclamationMarks.values()) t.destroy();
    for (const d of this.decorSprites) d.sprite.destroy();
    for (const t of this.elevationTextPool) t.destroy();
    this.elevationTextPool = [];
    this.entityRects.clear();
    this.entitySprites.clear();
    this.entityFacingMarks.clear();
    this.exclamationMarks.clear();
    this.decorSprites = [];
    this.decorRoomId = null;
  }

  /** Draw a yellow line from every CAUTION-level enforcer in the current room
   *  to its `lastStimulus` tile — the radical-predictability telegraph. */
  private drawEnforcerTelegraphs(): void {
    this.telegraphLayer.clear();
    if (!worldEngine.hasState()) return;
    const state = worldEngine.getState();
    const room = worldEngine.getCurrentRoom();
    if (!room) return;
    const pulse = 1.0;
    for (const e of state.entities.values()) {
      if (e.kind !== "ENFORCER" || e.status !== "ACTIVE") continue;
      if (e.roomId !== room.id) continue;
      if (e.alert?.level !== "CAUTION") continue;
      const tgt = e.alert.lastStimulus;
      if (!tgt) continue;
      // Cross-room stimuli get telegraphed only on the room they happened
      // in; for the other side, the enforcer just orients toward the doorway.
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

  /** Wash riot-orange across every tile a CDN-7 is currently sealing.
   *  Gated on `status === "ACTIVE"` so an EMP'd CDN-7's barrier vanishes the
   *  same frame the takedown lands. Reuses the telegraphLayer (depth 3). */
  private drawCdn7Anchors(state: WorldState): void {
    const room = worldEngine.getCurrentRoom();
    if (!room) return;
    for (const e of state.entities.values()) {
      if (e.kind !== "CDN_7" || e.status !== "ACTIVE") continue;
      if (e.roomId !== room.id) continue;
      const tiles = e.alert?.anchorTiles;
      if (!tiles || tiles.size === 0) continue;
      if ((e.alert?.anchorTurnsRemaining ?? 0) <= 0) continue;
      this.telegraphLayer.fillStyle(0xd06a2a, 0.4);
      for (const k of tiles) {
        const comma = k.indexOf(",");
        const x = +k.slice(0, comma);
        const y = +k.slice(comma + 1);
        this.telegraphLayer.fillRect(x * TILE_PX + 1, y * TILE_PX + 1, TILE_PX - 2, TILE_PX - 2);
      }
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
      for (const [id, sprite] of this.entitySprites) {
        sprite.destroy();
        this.entitySprites.delete(id);
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
    this.atmosphereLayer.clear();
    this.glyphLayer.clear();
    this.coneLayer.clear();
    this.telegraphLayer.clear();
    this.overlayLayer.clear();

    this.drawAtmosphere(state, room);

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
        const chestOpen =
          tile.kind === "ITEM_CHEST"
            ? state.chestPayloads.get(roomTileKey(room.id, { x, y }))?.opened ?? false
            : false;
        if (!cellDecorated) {
          this.drawTile(tile, x, y, visible, chestOpen);
        } else if (visible) {
          this.drawGlyph(
            x * TILE_PX + TILE_PX / 2,
            y * TILE_PX + TILE_PX / 2,
            tile,
            chestOpen,
          );
        }
      }
    }
    if (hasDecoration) {
      for (const { sprite, x, y } of this.decorSprites) {
        sprite.setAlpha(state.visibleTiles.has(`${x},${y}`) ? 1 : 0.32);
      }
    }

    // Hide all entity rects/sprites, then re-show only the ones in the current room.
    for (const [id, rect] of this.entityRects) {
      rect.setVisible(false);
      this.entityFacingMarks.get(id)?.setVisible(false);
    }
    for (const sprite of this.entitySprites.values()) {
      sprite.setVisible(false);
    }
    for (const entity of state.entities.values()) {
      const isEmpDisabled = entity.status === "DORMANT" && (entity.disabledTurnsRemaining ?? 0) > 0;
      if (entity.status !== "ACTIVE" && !isEmpDisabled) continue;
      if (entity.roomId !== room.id) continue;
      this.drawEntity(state, entity);
      // Grey tint signals the entity is temporarily disabled (recovering soon).
      if (isEmpDisabled) {
        this.entitySprites.get(entity.id)?.setTint(0x6a6a6a);
        this.entityRects.get(entity.id)?.setFillStyle(0x3a3a3a);
      }
    }

    this.drawTargetingOverlay(state, room);

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
    const playerCy =
      state.player.pos.y * TILE_PX + TILE_PX / 2 - elev * ELEVATION_PX_PER_STEP + CHAR_Y_OFFSET_PX;
    this.tweenTo(this.playerSprite, playerCx, playerCy);
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
    // Prefer the prefixed variant (crouched_/flashlight_), but fall back to the
    // base motion and finally to stand for the same facing. The new Rowan art
    // ships no flashlight_ frames, so without this fallback the flashlight key
    // never exists and play() is skipped — freezing the sprite on its last
    // anim (e.g. stuck facing north while walking east/west).
    const animKey = [
      `rowanibarra_${prefix}${motion}_${dir}`,
      `rowanibarra_${motion}_${dir}`,
      `rowanibarra_stand_${dir}`,
    ].find((k) => this.anims.exists(k));
    if (animKey && this.playerSprite.anims.currentAnim?.key !== animKey) {
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
        // Item PNGs are native 32×32. Offset above the player's head by half
        // the rendered character height so it tracks the sprite footprint
        // regardless of the character art's frame size.
        this.tweenTo(
          this.heldItemSprite,
          playerCx,
          playerCy - this.playerSprite.displayHeight / 2,
        );
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
    // CDN-7 chemical-irritant haze — hazy near-white wash while the player's
    // blindnessTurnsRemaining > 0. Cleared by EFFECT_EXPIRED { effect: "blindness" }.
    if (this.blindnessHaze > 0) {
      this.overlayLayer.fillStyle(0xb8c2c4, this.blindnessHaze);
      this.overlayLayer.fillRect(0, 0, vw, vh);
    }

    this.drawEnforcerTelegraphs();
    this.drawCdn7Anchors(state);
    this.drawDebugOverlays();
  }

  /** Tint floor and stipple fog tiles based on the room's atmosphere. Reads
   *  from AtmosphericsField (which caches the fog set per propagate) and
   *  state.atmosphere for temperature/airflow numbers. */
  private drawAtmosphere(state: WorldState, room: Room): void {
    const atmo = state.atmosphere.get(room.id);
    if (!atmo) return;
    const g = this.atmosphereLayer;
    const w = room.width * TILE_PX;
    const h = room.height * TILE_PX;
    // Temperature tint — cool blue when cold, warm amber when hot, nothing in
    // the comfort band. Alpha caps at 0.12 so the wash never blots out tiles.
    const dT = atmo.temperature - 21;
    if (Math.abs(dT) >= 4) {
      const cold = dT < 0;
      const t = Math.min(1, (Math.abs(dT) - 4) / 14);
      const colour = cold ? 0x4a8fbf : 0xd07a3a;
      g.fillStyle(colour, 0.04 + t * 0.08);
      g.fillRect(0, 0, w, h);
    }
    // Fog stipple — translucent splotches over fogged floor tiles.
    const fog = atmosphericsField.getFoggedTiles(state, room);
    if (fog.size > 0) {
      g.fillStyle(0x9bb1b6, 0.32);
      for (const k of fog) {
        const comma = k.indexOf(",");
        const x = +k.slice(0, comma);
        const y = +k.slice(comma + 1);
        g.fillRect(x * TILE_PX + 1, y * TILE_PX + 1, TILE_PX - 2, TILE_PX - 2);
      }
    }
    // Low-oxygen tint — desaturated reddish wash, applies even without fog.
    if (atmo.oxygen <= 50) {
      const t = 1 - atmo.oxygen / 50;
      g.fillStyle(0x6a1a1a, t * 0.18);
      g.fillRect(0, 0, w, h);
    }

    // HVAC console / wall thermostat glyph overlays. The base glyphLayer
    // already drew a TERMINAL outline; ring it teal/mint so the player can
    // tell the climate consoles apart from doc terminals.
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const tile = room.tiles[y * room.width + x];
        if (tile.kind !== "TERMINAL") continue;
        if (!state.visibleTiles.has(`${x},${y}`)) continue;
        const payload = state.terminalPayloads.get(
          roomTileKey(room.id, { x, y }),
        );
        if (!payload) continue;
        const cx = x * TILE_PX + TILE_PX / 2;
        const cy = y * TILE_PX + TILE_PX / 2;
        if (payload.terminalKind === "HVAC_CONSOLE") {
          this.glyphLayer.lineStyle(2, 0x6ad0a4, 0.95);
          this.glyphLayer.strokeRect(cx - 9, cy - 7, 18, 14);
        } else if (payload.terminalKind === "WALL_TERMINAL") {
          this.glyphLayer.lineStyle(2, 0x9adbe6, 0.9);
          this.glyphLayer.strokeRect(cx - 6, cy - 4, 12, 8);
        }
      }
    }
  }

  private drawTile(tile: Tile, x: number, y: number, visible: boolean, chestOpen = false): void {
    const px = x * TILE_PX;
    const py = y * TILE_PX;
    const colour = TILE_COLORS[tile.kind] ?? 0x222d33;
    this.tileLayer.fillStyle(colour, visible ? 1 : 0.32);
    this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
    this.tileLayer.lineStyle(1, 0x223035, visible ? 0.6 : 0.25);
    this.tileLayer.strokeRect(px, py, TILE_PX - 1, TILE_PX - 1);
    if (visible) this.drawGlyph(px + TILE_PX / 2, py + TILE_PX / 2, tile, chestOpen);
  }

  private drawGlyph(cx: number, cy: number, tile: Tile, chestOpen = false): void {
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
    } else if (kind === "ITEM_CHEST") {
      // Chest: a filled body with a lid above it. Closed = filled lid + clasp;
      // open = lid hinged back (outline only) so looted chests read as empty.
      g.fillStyle(0xc8a05a, 0.9);
      g.fillRect(cx - 8, cy - 2, 16, 9);
      if (chestOpen) {
        g.lineStyle(2, 0xc8a05a, 0.9);
        g.strokeRect(cx - 8, cy - 9, 16, 6);
      } else {
        g.fillStyle(0xd9b66b, 0.95);
        g.fillRect(cx - 8, cy - 8, 16, 7);
        g.fillStyle(0xebd14a, 0.95);
        g.fillRect(cx - 2, cy - 2, 4, 5);
      }
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
    const visible = state.visibleTiles.has(`${entity.pos.x},${entity.pos.y}`);

    // Entities with packed sprite art draw from the chars-art atlas; kinds
    // without art (SILICATEs) fall back to the colored-rectangle placeholder.
    const slug =
      entity.kind === "ENFORCER" ? "enforcer" :
        entity.kind === "SURVEILLANCE_DRONE" ? "securitydrone" :
          entity.kind === "SECURITY_CAMERA" ? "securitycamera" :
            entity.kind === "ORDERLY" ? "nwsmac01" :
              entity.kind === "CDN_7" ? "cdn7" :
                null;
    // Slugs whose static reference pose lives under idle/ rather than stand/
    // (cdn7 has only idle frames from the Pixel Lab object import).
    const refPose = slug === "cdn7" ? "idle" : "stand";

    if (slug) {
      let sprite = this.entitySprites.get(entity.id);
      if (!sprite) {
        sprite = this.add.sprite(px, py, "chars-art", `${slug}/${refPose}/${entity.facing}/01`);
        if (PROP_SLUGS.has(slug)) {
          // Props (drone/camera) have little padding — size by frame width,
          // centred. Drones hover, cameras are ceiling-mounted.
          sprite.setOrigin(0.5, 0.5);
          sprite.setScale((propFootprintTiles(slug) * TILE_PX) / sprite.width);
        } else {
          // Characters: fit visible body height so padding doesn't shrink them.
          fitCharacterSprite(sprite, this, "chars-art", `${slug}/${refPose}/south/01`, CHAR_VISIBLE_TILES);
        }
        sprite.setDepth(4);
        this.entitySprites.set(entity.id, sprite);
      }
      this.tweenTo(sprite, px, py + (PROP_SLUGS.has(slug) ? 0 : CHAR_Y_OFFSET_PX));
      sprite.setVisible(visible);
      // The directional sprite conveys facing on its own — hide the rect/triangle.
      this.entityRects.get(entity.id)?.setVisible(false);
      this.entityFacingMarks.get(entity.id)?.setVisible(false);

      // Cameras are fixed (idle only); enforcers/drones walk when they moved this turn.
      // CDN-7 holds an `anchor` pose while planted across the corridor; the
      // fallback list below still resolves to idle for facings where the
      // anchor anim hasn't been generated yet.
      const moving = entity.lastMoveTurn === state.turn;
      const cdn7Anchored = entity.kind === "CDN_7" && (entity.alert?.anchorTurnsRemaining ?? 0) > 0;
      const moveAnim = slug === "securitydrone" ? "move" : "walkcycle";
      const motion =
        entity.kind === "SECURITY_CAMERA" ? "idle" :
          cdn7Anchored ? "anchor" :
            moving ? moveAnim : "idle";
      const animKey = [
        `${slug}_${motion}_${entity.facing}`,
        `${slug}_idle_${entity.facing}`,
      ].find((k) => this.anims.exists(k));
      if (animKey) {
        if (sprite.anims.currentAnim?.key !== animKey) sprite.play(animKey);
      } else {
        sprite.anims.stop();
        const frame = `${slug}/${refPose}/${entity.facing}/01`;
        if (this.textures.get("chars-art").has(frame)) sprite.setFrame(frame);
      }
    } else {
      let rect = this.entityRects.get(entity.id);
      // VENT-4 (Environmental Optimizer) gets the deep-maroon palette of its
      // placeholder atlas frame; other silicates stay on the cyan baseline.
      const colour =
        entity.kind === "SILICATE"
          ? entity.id === "VENT-4" ? 0x9b2c2c : 0x9adbe6
          : 0xc8dbe6;
      if (!rect) {
        rect = this.add.rectangle(px, py, TILE_PX - 14, TILE_PX - 14, colour);
        rect.setStrokeStyle(2, 0xe6f0f2);
        rect.setDepth(4);
        this.entityRects.set(entity.id, rect);
      }
      this.tweenTo(rect, px, py);
      rect.setFillStyle(colour);
      rect.setVisible(visible);

      let mark = this.entityFacingMarks.get(entity.id);
      if (!mark) {
        mark = this.add.triangle(px, py, 0, 0, -6, 8, 6, 8, 0xe6f0f2);
        mark.setDepth(5);
        this.entityFacingMarks.set(entity.id, mark);
      }
      this.placeFacingMark(mark, px, py, entity.facing);
      mark.setVisible(visible);
    }

    if (
      entity.status === "ACTIVE" &&
      (entity.kind === "ENFORCER" ||
        entity.kind === "SURVEILLANCE_DRONE" ||
        entity.kind === "SECURITY_CAMERA")
    ) {
      this.drawEnforcerCone(entity);
    }
  }

  private drawEnforcerCone(enforcer: Entity): void {
    const state = worldEngine.getState();
    const visible = enforcerSystem.visibleTiles(state, enforcer);
    const level = enforcer.alert?.level ?? "NORMAL";
    // Tint by *threat to the player* — when the player is COMPLIANT (GREEN)
    // the cone is rendered neutrally regardless of enforcer state, because the
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
      this.tweenTo(mark, cx, cy - offset);
      mark.setRotation(Math.PI);
    } else if (facing === "south") {
      this.tweenTo(mark, cx, cy + offset);
      mark.setRotation(0);
    } else if (facing === "east") {
      this.tweenTo(mark, cx + offset, cy);
      mark.setRotation(-Math.PI / 2);
    } else {
      this.tweenTo(mark, cx - offset, cy);
      mark.setRotation(Math.PI / 2);
    }
  }

  private flashExclamation(enforcerId: string): void {
    if (!worldEngine.hasState()) return;
    const state = worldEngine.getState();
    const enforcer = state.entities.get(enforcerId);
    if (!enforcer || enforcer.roomId !== state.player.roomId) return;
    const px = enforcer.pos.x * TILE_PX + TILE_PX / 2;
    const py = enforcer.pos.y * TILE_PX - 6;
    let mark = this.exclamationMarks.get(enforcerId);
    if (!mark) {
      mark = this.add.text(px, py, "!", {
        fontFamily: "Arial Black, sans-serif",
        fontSize: "28px",
        color: "#ff5050",
      });
      mark.setOrigin(0.5, 1);
      mark.setDepth(10);
      this.exclamationMarks.set(enforcerId, mark);
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

  private tweenTo(target: Phaser.GameObjects.Components.Transform, x: number, y: number): void {
    if (target.x === x && target.y === y) return;
    this.tweens.add({
      targets: target,
      x: x,
      y: y,
      duration: 200,
      ease: 'Linear',
      // overwrite: true will cancel existing tweens on the target
      // to avoid conflicting movements
      overwrite: true,
    });
  }

  private drawTargetingOverlay(
    state: ReturnType<typeof worldEngine.getState>,
    room: Room,
  ): void {
    this.targetingLayer.clear();
    const tgt = useTargetingStore.getState();
    if (!tgt.active || !tgt.cursor) return;

    const cursor = tgt.cursor;
    const playerPos = state.player.pos;
    const dx = cursor.x - playerPos.x;
    const dy = cursor.y - playerPos.y;
    const EMP_GRENADE_MAX_THROW = 6;
    const EMP_GRENADE_RADIUS = 3;
    const inRange = dx * dx + dy * dy <= EMP_GRENADE_MAX_THROW * EMP_GRENADE_MAX_THROW;
    const cursorTile = room.tiles[cursor.y * room.width + cursor.x];
    const isVisible = state.visibleTiles.has(`${cursor.x},${cursor.y}`);
    const isValid = inRange && !!cursorTile && !cursorTile.solid && isVisible;

    // AoE preview — shade tiles within the burst radius of the cursor.
    const r2 = EMP_GRENADE_RADIUS * EMP_GRENADE_RADIUS;
    this.targetingLayer.fillStyle(0x9050e0, 0.2);
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        if (!state.visibleTiles.has(`${x},${y}`)) continue;
        const adx = x - cursor.x;
        const ady = y - cursor.y;
        if (adx * adx + ady * ady > r2) continue;
        this.targetingLayer.fillRect(x * TILE_PX + 1, y * TILE_PX + 1, TILE_PX - 2, TILE_PX - 2);
      }
    }

    // Cursor highlight — green when valid, red when not.
    const cursorColor = isValid ? 0x6ad0a4 : 0xff5050;
    this.targetingLayer.lineStyle(2, cursorColor, 0.95);
    this.targetingLayer.strokeRect(
      cursor.x * TILE_PX + 1,
      cursor.y * TILE_PX + 1,
      TILE_PX - 2,
      TILE_PX - 2,
    );
  }

  private playDetonation(p: { itemType: string; roomId: string; pos: Vec2; radius: number }): void {
    const room = worldEngine.getCurrentRoom();
    if (!room || room.id !== p.roomId) return;
    const key = ITEM_DETONATION_FX[p.itemType as ItemType] ?? DEFAULT_DETONATION_FX;
    const effect = getVfxEffect(key);
    if (!effect) return;
    const cx = p.pos.x * TILE_PX + TILE_PX / 2;
    const cy = p.pos.y * TILE_PX + TILE_PX / 2;
    const fx = this.add.sprite(cx, cy, effect.key, 0);
    fx.setDepth(12);
    const targetPx = (2 * p.radius + 1) * TILE_PX;
    fx.setScale(targetPx / effect.frameSize);
    fx.play(effect.key);
    fx.once("animationcomplete", () => fx.destroy());
  }
}
