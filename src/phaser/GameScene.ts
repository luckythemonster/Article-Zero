// GameScene — the in-world renderer. Reads from WorldEngine state and redraws
// tiles + sprites + visibility mask. Phaser is a slave to the EventBus; it
// never owns gameplay state.

import { Phaser } from "../engine/EngineAdapter";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { mooseAnimKey } from "../data/tilesets/anim-keys";
import type { MooseTileAnim } from "../data/tilesets/types";
import { MOOSE_TILESETS } from "../data/tilesets/registry.generated";
import type { Entity, Facing, Tile, TileKind, Vec3 } from "../types/world.types";

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
  CHASM: 0x05080d,
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
  /** Pool of decoration sprites placed by the moose-import path. Keyed
   *  per `${layerIndex}:${x},${y}` so they can be re-used across redraws.
   *  Phaser.GameObjects.Sprite is an Image subclass, so static cells render
   *  the same way; animated cells (driven by Ed multi-keyframe TileDefs)
   *  can additionally `.play()` an animation registered by BootScene. */
  private decoSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private decoFloorZ: number | null = null;
  /** frame index -> tile-anim metadata for the currently active decoration
   *  texture. Built lazily when the floor's decoration texture changes. */
  private decoAnimByFrame = new Map<number, { textureKey: string; anim: MooseTileAnim }>();
  private decoTextureKey: string | null = null;
  /** Door-cell sprite key by `${x},${y},${z}` so DOOR_TOGGLED can locate
   *  the sprite without scanning all decoration cells. */
  private doorSpriteByPos = new Map<string, string>();
  /** Per-cell "open frame" sourced from the `doors_open` layer when the
   *  author paints one. The doors-layer sprite swaps to this frame when
   *  the cell's tile-kind is DOOR_OPEN, falling back to the animation's
   *  settle frame if no `doors_open` paint exists. */
  private doorOpenFrameByPos = new Map<string, number>();
  /** Per-cell "closed frame" sourced from the `doors` layer so we can
   *  always restore exactly what the author painted, regardless of any
   *  drift in the animation's baseFrame. */
  private doorClosedFrameByPos = new Map<string, number>();
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
    eventBus.on("DOOR_TOGGLED", (p) => {
      this.playDoorAnim(p.pos, p.open);
      this.redraw();
    });
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
    const useDecoration = !!floor.decoration;

    if (useDecoration) {
      this.renderDecoration(state, floor, memoryActive);
    } else {
      this.clearDecorationSprites();
    }

    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const tile = floor.tiles[y * floor.width + x];
        const key = `${x},${y},${floor.z}`;
        const visible = state.visibleTiles.has(key);
        const remembered = memoryActive && state.memoryTrace.has(key);
        this.drawTile(tile, x, y, visible, remembered, useDecoration);
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
    decorationActive: boolean,
  ): void {
    const px = this.offsetX + x * TILE_PX;
    const py = this.offsetY + y * TILE_PX;
    if (decorationActive) {
      // Decoration sprites carry the visual weight; we only need glyph
      // overlays for game-relevant tile kinds, plus a faint dim wash on
      // unseen / remembered cells to communicate FOV.
      if (visible) {
        this.drawGlyph(px + TILE_PX / 2, py + TILE_PX / 2, tile.kind);
      } else if (remembered) {
        this.tileLayer.fillStyle(0x050809, 0.35);
        this.tileLayer.fillRect(px, py, TILE_PX, TILE_PX);
      } else {
        this.tileLayer.fillStyle(0x050809, 0.7);
        this.tileLayer.fillRect(px, py, TILE_PX, TILE_PX);
      }
      return;
    }

    const baseColour = TILE_COLORS[tile.kind];
    if (visible) {
      this.tileLayer.fillStyle(baseColour, 1);
      this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
      this.tileLayer.lineStyle(1, 0x223035, 0.6);
      this.tileLayer.strokeRect(px, py, TILE_PX - 1, TILE_PX - 1);
      this.drawGlyph(px + TILE_PX / 2, py + TILE_PX / 2, tile.kind);
    } else if (remembered) {
      this.tileLayer.fillStyle(baseColour, 0.42);
      this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
      this.tileLayer.lineStyle(1, 0x223035, 0.25);
      this.tileLayer.strokeRect(px, py, TILE_PX - 1, TILE_PX - 1);
    } else {
      this.tileLayer.fillStyle(baseColour, 0.18);
      this.tileLayer.fillRect(px, py, TILE_PX - 1, TILE_PX - 1);
    }
  }

  private clearDecorationSprites(): void {
    for (const sprite of this.decoSprites.values()) sprite.destroy();
    this.decoSprites.clear();
    this.decoFloorZ = null;
    this.doorSpriteByPos.clear();
    this.doorOpenFrameByPos.clear();
    this.doorClosedFrameByPos.clear();
  }

  private ensureDecoAnimIndex(textureKey: string): void {
    if (this.decoTextureKey === textureKey) return;
    this.decoAnimByFrame.clear();
    this.decoTextureKey = textureKey;
    const entry = MOOSE_TILESETS.find((t) => t.key === textureKey);
    for (const a of entry?.tileAnims ?? []) {
      this.decoAnimByFrame.set(a.baseFrame, { textureKey, anim: a });
      // Settle frames also count — when we restore mid-game from a save
      // mid-open, the cell's visible frame is the settle frame.
      this.decoAnimByFrame.set(a.settleFrame, { textureKey, anim: a });
    }
  }

  private renderDecoration(
    state: ReturnType<typeof worldEngine.getState>,
    floor: NonNullable<ReturnType<typeof worldEngine.getFloor>>,
    memoryActive: boolean,
  ): void {
    const dec = floor.decoration!;
    if (this.decoFloorZ !== floor.z) {
      this.clearDecorationSprites();
      this.decoFloorZ = floor.z;
    }
    this.ensureDecoAnimIndex(dec.textureKey);
    const seen = new Set<string>();
    const widthScale = TILE_PX / dec.frameWidth;
    const displayHeight = dec.frameHeight * widthScale;

    // First pass: feed the doors_open layer into the open-frame map so the
    // doors render path can consult it. The layer itself never renders —
    // its visual representation IS the doors-layer sprite, swapped to the
    // open frame when the cell's tile-kind is DOOR_OPEN.
    for (const layer of dec.layers) {
      if (layer.name.toLowerCase() !== "doors_open") continue;
      for (let y = 0; y < floor.height; y++) {
        const row = layer.data[y] ?? [];
        for (let x = 0; x < floor.width; x++) {
          const idx = row[x] ?? 0;
          if (!idx) continue;
          this.doorOpenFrameByPos.set(`${x},${y},${floor.z}`, idx - 1);
        }
      }
    }

    dec.layers.forEach((layer, layerIdx) => {
      const lname = layer.name.toLowerCase();
      // doors_open data is already consumed; skip its sprite render entirely.
      if (lname === "doors_open") return;
      const isDoorLayer = lname === "doors";
      for (let y = 0; y < floor.height; y++) {
        const row = layer.data[y] ?? [];
        for (let x = 0; x < floor.width; x++) {
          const idx = row[x] ?? 0;
          if (!idx) continue;
          const tileKey = `${x},${y},${floor.z}`;
          const visible = state.visibleTiles.has(tileKey);
          const remembered = memoryActive && state.memoryTrace.has(tileKey);
          if (!visible && !remembered) continue;
          const px = this.offsetX + x * TILE_PX + TILE_PX / 2;
          const py = this.offsetY + y * TILE_PX + TILE_PX;
          const key = `${layerIdx}:${tileKey}`;
          let sprite = this.decoSprites.get(key);
          // Frame index = stored index minus 1 (Tiled/Ed convention).
          let frame = idx - 1;
          // Doors specifically swap frame based on tile-kind so an open
          // door shows the open art (from doors_open or animation settle).
          if (isDoorLayer) {
            this.doorClosedFrameByPos.set(tileKey, frame);
            const tile = floor.tiles[y * floor.width + x];
            if (tile?.kind === "DOOR_OPEN") {
              const openFrame = this.doorOpenFrameByPos.get(tileKey);
              const animMeta = this.decoAnimByFrame.get(frame);
              frame = openFrame ?? animMeta?.anim.settleFrame ?? frame;
            }
          }
          if (!sprite) {
            sprite = this.add.sprite(px, py, dec.textureKey, frame);
            sprite.setOrigin(0.5, 1);
            sprite.setDepth(layerIdx);
            this.decoSprites.set(key, sprite);
          } else {
            sprite.setPosition(px, py);
            // Don't overwrite frame if the sprite is mid-animation.
            if (!sprite.anims.isPlaying) sprite.setFrame(frame);
            sprite.setOrigin(0.5, 1);
          }
          sprite.setDisplaySize(TILE_PX, displayHeight);
          sprite.setVisible(true);
          const baseAlpha = layer.opacity;
          sprite.setAlpha(visible ? baseAlpha : baseAlpha * 0.42);
          seen.add(key);
          if (isDoorLayer) this.doorSpriteByPos.set(tileKey, key);
        }
      }
    });

    for (const [key, sprite] of this.decoSprites) {
      if (!seen.has(key)) sprite.setVisible(false);
    }
  }

  /** Play the open/close animation on the door sprite at `pos`. Called from
   *  the DOOR_TOGGLED listener registered in `create()`. Settles on the
   *  per-cell open/closed frame from the layer data so author-painted
   *  open-state art (the `doors_open` layer) wins over the animation's
   *  generic settle frame. */
  private playDoorAnim(pos: Vec3, opening: boolean): void {
    const tileKey = `${pos.x},${pos.y},${pos.z}`;
    const spriteKey = this.doorSpriteByPos.get(tileKey);
    if (!spriteKey) return;
    const sprite = this.decoSprites.get(spriteKey);
    if (!sprite) return;
    const currentFrame = sprite.frame.name;
    const frameIdx = Number(currentFrame);
    const meta = this.decoAnimByFrame.get(frameIdx)
      ?? (() => {
        // After a save/load the sprite may currently sit on a per-cell
        // open/closed frame that isn't in the anim index. Fall back to
        // any registered animation for this texture.
        for (const v of this.decoAnimByFrame.values()) return v;
        return undefined;
      })();
    if (!meta) return;
    const direction = opening ? "open" : "close";
    const key = mooseAnimKey(meta.textureKey, meta.anim.handle, direction);
    if (!this.anims.exists(key)) return;
    const openFrame = this.doorOpenFrameByPos.get(tileKey) ?? meta.anim.settleFrame;
    const closedFrame = this.doorClosedFrameByPos.get(tileKey) ?? meta.anim.baseFrame;
    const settleAfter = opening ? openFrame : closedFrame;
    sprite.once("animationcomplete", () => {
      sprite.setFrame(settleAfter);
    });
    sprite.play(key, true);
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
