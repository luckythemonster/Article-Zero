// PlayerPhysicsBridge — the body↔WorldState sync.
//
// Read keyboard cursors, ask the FSM for a motion vector, project the
// body's next tile cell against tileAt().solid + entityAt() for collision,
// commit a velocity, sync the WorldState player tile coord, detect doorway
// crossings, scale velocity for stairs, lerp current visual elevation, and
// run a throttled per-frame proximity sight check on guards.
//
// The physics body stays at the floor-projected y. The visual offset is
// applied to the sprite's displayY by the renderer — see RoomScene.

import * as Phaser from "phaser";
import type { Side, Tile, Vec2, WorldState } from "../types/world.types";
import { worldEngine } from "./WorldEngine";
import { playerStateMachine } from "./PlayerStateMachine";
import { guardSystem } from "./GuardSystem";
import { eventBus } from "./EventBus";
import {
  FRAME_SIGHT_CHECK_MS,
  STAIRS_DOWN_FACTOR,
  STAIRS_UP_FACTOR,
  TILE_PX,
} from "./PhysicsConfig";

const SIDE_DIR: Record<Side, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
  E: { dx: 1, dy: 0 },
};

/** Visual GameObject with an attached Arcade body. We use the Rectangle's
 *  centered x/y for tile-coord math (Rectangle.setOrigin(0.5,0.5) is the
 *  Phaser default) and read body.velocity/setVelocity for movement. */
type PhysicsRect = Phaser.GameObjects.Rectangle & {
  body: Phaser.Physics.Arcade.Body;
};

export class PlayerPhysicsBridge {
  private sprite: PhysicsRect | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key> | null = null;
  private lastSightCheckMs = 0;
  private doorwayCooldownMs = 0;

  /** Smoothed visual elevation. Renderer reads this each frame and applies
   *  it to sprite.displayY. Range: real numbers (negative for chasm). */
  currentElevation = 0;

  attach(scene: Phaser.Scene, sprite: PhysicsRect): void {
    this.sprite = sprite;
    const kb = scene.input.keyboard;
    if (kb) {
      this.cursors = kb.createCursorKeys();
      this.wasd = {
        W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }
  }

  detach(): void {
    this.sprite = null;
    this.cursors = null;
    this.wasd = null;
  }

  /** Snap the physics body to the engine's current tile coord. Called on
   *  attach (initial spawn) and on room transitions, since the body's
   *  pixel position would otherwise carry over from the prior room. */
  recenter(): void {
    if (!this.sprite || !worldEngine.hasState()) return;
    const pos = worldEngine.getState().player.pos;
    this.sprite.body.reset(
      pos.x * TILE_PX + TILE_PX / 2,
      pos.y * TILE_PX + TILE_PX / 2,
    );
  }

  update(delta: number): void {
    if (!this.sprite || !worldEngine.hasState()) return;
    const state = worldEngine.getState();

    this.doorwayCooldownMs = Math.max(0, this.doorwayCooldownMs - delta);

    const [dx, dy] = this.readInput();

    let motion = playerStateMachine.motion(state, dx, dy);

    // Stair velocity scaling — applied here so it works in WALK, CREEP, or
    // CLIMBING. The state machine only governs canPerform; the speed bias
    // is a property of the tile, not the state.
    if (motion.kind === "VELOCITY") {
      const here = this.tileAt(state, state.player.pos);
      if (here && here.kind === "STAIRS" && here.direction) {
        const sd = SIDE_DIR[here.direction];
        // dot of input direction with stair direction
        const dot = dx * sd.dx + dy * sd.dy;
        if (dot > 0) {
          motion = { kind: "VELOCITY", vx: motion.vx * STAIRS_UP_FACTOR, vy: motion.vy * STAIRS_UP_FACTOR };
        } else if (dot < 0) {
          motion = { kind: "VELOCITY", vx: motion.vx * STAIRS_DOWN_FACTOR, vy: motion.vy * STAIRS_DOWN_FACTOR };
        }
      }
    }

    // Update facing from input direction (best-effort, no event spam — the
    // existing PLAYER_FACING_CHANGED event fires only via discrete actions).
    if (dx !== 0 || dy !== 0) {
      const f = dy < 0 ? "north" : dy > 0 ? "south" : dx < 0 ? "west" : "east";
      if (state.player.facing !== f) {
        state.player.facing = f;
        eventBus.emit("PLAYER_FACING_CHANGED", { facing: f });
      }
    }

    // Apply velocity with collision-aware axis projection.
    if (motion.kind === "BLOCKED") {
      this.sprite.body.setVelocity(0, 0);
    } else if (motion.kind === "VELOCITY") {
      const vx = this.canMoveAxisX(state, motion.vx) ? motion.vx : 0;
      const vy = this.canMoveAxisY(state, motion.vy) ? motion.vy : 0;
      this.sprite.body.setVelocity(vx, vy);
    }

    // Sync tile coord. If center of body has crossed into a different tile,
    // run doorway detection and notify the engine.
    this.syncTileCoord(state);

    // Smoothed elevation for renderer.
    this.currentElevation = this.computeSmoothedElevation(state);

    // Throttled guard proximity sight check.
    this.lastSightCheckMs += delta;
    if (this.lastSightCheckMs >= FRAME_SIGHT_CHECK_MS) {
      this.lastSightCheckMs = 0;
      guardSystem.frameSightCheck(state);
    }

    // FSM tick after sync — its resolver reads the updated player.pos /
    // roomId / hidingTileKey.
    playerStateMachine.update(state, delta);
  }

  private readInput(): [number, number] {
    let dx = 0;
    let dy = 0;
    const c = this.cursors;
    const w = this.wasd;
    if (c?.left.isDown || w?.A.isDown) dx -= 1;
    if (c?.right.isDown || w?.D.isDown) dx += 1;
    if (c?.up.isDown || w?.W.isDown) dy -= 1;
    if (c?.down.isDown || w?.S.isDown) dy += 1;
    return [dx, dy];
  }

  private canMoveAxisX(state: WorldState, vx: number): boolean {
    if (!this.sprite || vx === 0) return true;
    const cx = this.sprite.x;
    const cy = this.sprite.y;
    const probeX = cx + Math.sign(vx) * (TILE_PX / 2);
    const tile = this.tileAtPx(state, probeX, cy);
    if (!tile) return false;
    if (tile.solid) return false;
    return !this.entityAtPx(state, probeX, cy);
  }

  private canMoveAxisY(state: WorldState, vy: number): boolean {
    if (!this.sprite || vy === 0) return true;
    const cx = this.sprite.x;
    const cy = this.sprite.y;
    const probeY = cy + Math.sign(vy) * (TILE_PX / 2);
    const tile = this.tileAtPx(state, cx, probeY);
    if (!tile) return false;
    if (tile.solid) return false;
    return !this.entityAtPx(state, cx, probeY);
  }

  private syncTileCoord(state: WorldState): void {
    if (!this.sprite) return;
    const tx = Math.floor(this.sprite.x / TILE_PX);
    const ty = Math.floor(this.sprite.y / TILE_PX);
    const prev = state.player.pos;
    if (tx === prev.x && ty === prev.y) return;

    // Doorway crossing detection. If the new tile is a doorway whose side
    // matches recent velocity direction, route through crossDoorway. The
    // lockout prevents a one-frame bounce-back.
    if (this.doorwayCooldownMs <= 0) {
      const dx = tx - prev.x;
      const dy = ty - prev.y;
      const crossed = worldEngine.crossDoorway(prev, dx, dy);
      if (crossed) {
        this.doorwayCooldownMs = 250;
        // Engine has updated player.pos to landingPos; place the body there.
        // body.reset(x, y) moves both the body and the linked GameObject.
        const landing = state.player.pos;
        this.sprite.body.reset(
          landing.x * TILE_PX + TILE_PX / 2,
          landing.y * TILE_PX + TILE_PX / 2,
        );
        return;
      }
    }

    worldEngine.setPlayerTilePos({ x: tx, y: ty });
  }

  private computeSmoothedElevation(state: WorldState): number {
    if (!this.sprite) return 0;
    const here = this.tileAt(state, state.player.pos);
    if (!here) return 0;
    const baseElevation = here.elevation;
    // For STAIRS tiles, lerp between this cell's elevation and the next
    // cell's elevation along the stair direction, using sub-tile body
    // position as the lerp factor.
    if (here.kind === "STAIRS" && here.direction) {
      const sd = SIDE_DIR[here.direction];
      const nx = state.player.pos.x + sd.dx;
      const ny = state.player.pos.y + sd.dy;
      const next = this.tileAtCoord(state, nx, ny);
      if (next) {
        const dNext = next.elevation - baseElevation;
        const cellOriginX = state.player.pos.x * TILE_PX;
        const cellOriginY = state.player.pos.y * TILE_PX;
        const subX = (this.sprite.x - cellOriginX) / TILE_PX; // 0..1
        const subY = (this.sprite.y - cellOriginY) / TILE_PX;
        const t = sd.dx !== 0
          ? (sd.dx > 0 ? subX : 1 - subX)
          : (sd.dy > 0 ? subY : 1 - subY);
        return baseElevation + dNext * Math.max(0, Math.min(1, t));
      }
    }
    return baseElevation;
  }

  private tileAt(state: WorldState, p: Vec2): Tile | undefined {
    return this.tileAtCoord(state, p.x, p.y);
  }

  private tileAtCoord(state: WorldState, x: number, y: number): Tile | undefined {
    const room = state.rooms.get(state.player.roomId);
    if (!room) return undefined;
    if (x < 0 || y < 0 || x >= room.width || y >= room.height) return undefined;
    return room.tiles[y * room.width + x];
  }

  private tileAtPx(state: WorldState, px: number, py: number): Tile | undefined {
    return this.tileAtCoord(state, Math.floor(px / TILE_PX), Math.floor(py / TILE_PX));
  }

  private entityAtPx(state: WorldState, px: number, py: number): boolean {
    const tx = Math.floor(px / TILE_PX);
    const ty = Math.floor(py / TILE_PX);
    if (tx === state.player.pos.x && ty === state.player.pos.y) return false;
    for (const e of state.entities.values()) {
      if (e.status !== "ACTIVE") continue;
      if (e.roomId !== state.player.roomId) continue;
      if (e.pos.x === tx && e.pos.y === ty) return true;
    }
    return false;
  }
}

export const playerPhysicsBridge = new PlayerPhysicsBridge();
