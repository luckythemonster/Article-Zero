// WorldEngine — singleton orchestrator. Owns the WorldState, hosts all
// subsystems, exposes a small API for actions and accessors. Publishes via
// the EventBus; never mutates UI directly.

import type {
  AmbientLightLevel,
  Era,
  Facing,
  Room,
  RoomId,
  Vec2,
  WorldState,
} from "../types/world.types";
import { eventBus } from "./EventBus";
import {
  computeCone,
  getEffectivePlayerRadius,
} from "./VisionCone";
import { seedFromEra } from "./WorldEngineState";
import { actions } from "./WorldEngineActions";
import { documentArchive } from "./DocumentArchive";
import { alignmentSession } from "./AlignmentSession";
import { soundField } from "./SoundField";
import { guardSystem } from "./GuardSystem";
import { extractionTerminal } from "./ExtractionTerminal";
import { complianceSystem } from "./ComplianceSystem";

function rememberVisible(s: WorldState, roomId: RoomId): void {
  let set = s.exploredTiles.get(roomId);
  if (!set) {
    set = new Set();
    s.exploredTiles.set(roomId, set);
  }
  for (const k of s.visibleTiles) set.add(k);
}

class WorldEngine {
  private state: WorldState | null = null;

  initWorld(era: Era): void {
    this.state = seedFromEra(era);
    this.resetSubsystems();
    extractionTerminal.reset(this.state);
    this.recomputeFOV();
    complianceSystem.recompute(this.state);
    eventBus.emit("ERA_SELECTED", { era });
    eventBus.emit("ROOM_ENTERED", { roomId: this.state.player.roomId });
    eventBus.emit("TURN_START", {
      turn: 1,
      apRestored: this.state.player.apMax,
    });
  }

  hasState(): boolean {
    return this.state !== null;
  }

  getState(): WorldState {
    if (!this.state) throw new Error("WorldEngine not initialised");
    return this.state;
  }

  getRoom(id: RoomId): Room | undefined {
    return this.getState().rooms.get(id);
  }

  getCurrentRoom(): Room | undefined {
    return this.getRoom(this.getState().player.roomId);
  }

  private resetSubsystems(): void {
    documentArchive.reset();
    alignmentSession.reset();
    soundField.reset();
  }

  // Public action surface -----------------------------------------------
  // Every wrapper recomputes compliance after the underlying action so
  // downstream consumers (AlertFSM, HUD) see a consistent tier without
  // waiting for the next turn boundary.

  move = (dx: number, dy: number) => {
    const ok = this.useStanceMove(dx, dy);
    if (ok) {
      this.recomputeFOV();
      complianceSystem.recompute(this.getState());
    }
    return ok;
  };

  knock = () => {
    const ok = actions.knock(this.getState());
    if (ok) {
      this.recomputeFOV();
      complianceSystem.recompute(this.getState());
    }
    return ok;
  };

  toggleStance = () => {
    actions.toggleStance(this.getState());
  };

  interact = () => {
    const ok = actions.interact(this.getState());
    if (ok) {
      this.recomputeFOV();
      complianceSystem.recompute(this.getState());
    }
    return ok;
  };

  toggleFlashlight = () => {
    actions.toggleFlashlight(this.getState());
    this.recomputeFOV();
  };

  peek = (dir?: Facing) => {
    const ok = actions.peek(this.getState(), dir);
    if (ok) this.recomputeFOV();
    return ok;
  };

  endTurn = () => this.advanceTurn();

  canStartAlignment = (entityId: string) =>
    actions.canStartAlignment(this.getState(), entityId);
  commitAlignment = (entityId: string) => {
    const ok = actions.commitAlignment(this.getState(), entityId);
    if (ok) complianceSystem.recompute(this.getState());
    return ok;
  };
  spendAlignmentAdvance = () => actions.spendAlignmentAdvance(this.getState());
  killScreen = () => {
    const ok = actions.setAlignmentLight(this.getState(), false, true);
    if (ok) complianceSystem.recompute(this.getState());
    return ok;
  };
  wakeScreen = () => {
    const ok = actions.setAlignmentLight(this.getState(), true, true);
    if (ok) complianceSystem.recompute(this.getState());
    return ok;
  };

  private useStanceMove(dx: number, dy: number): boolean {
    const s = this.getState();
    if (s.player.stance === "CREEP") return actions.creep(s, dx, dy);
    return actions.move(s, dx, dy);
  }

  private advanceTurn(): void {
    const s = this.getState();
    // Peek is one-turn-only.
    actions.clearPeek(s);
    s.turn += 1;
    // Refresh AP up to apMax.
    const previousAp = s.player.ap;
    s.player.ap = s.player.apMax;
    eventBus.emit("TURN_END", { turn: s.turn - 1 });
    eventBus.emit("TURN_START", { turn: s.turn, apRestored: s.player.apMax });
    eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: s.player.ap });

    // Alignment light is a strong silent emitter that draws guards in the
    // same room toward the player tile.
    if (s.alignmentLightActive) {
      soundField.emit({
        roomId: s.player.roomId,
        pos: s.player.pos,
        intensity: 5,
        reason: "alignment-light",
      });
    }

    // Resolve sound, then tick guards, then tick extraction.
    const heard = soundField.propagate(s);
    soundField.reset();

    const wasDetected = s.detected;
    s.detected = false;
    guardSystem.tick(s, heard);
    if (wasDetected && !s.detected) {
      eventBus.emit("PLAYER_DETECTION_CLEARED", {});
    }
    extractionTerminal.tick(s);

    // After extraction tick may have altered progress, refresh compliance.
    complianceSystem.recompute(s);

    // Flashlight battery drain.
    if (s.player.flashlightOn) {
      s.player.flashlightBattery -= 1;
      if (s.player.flashlightBattery <= 0) {
        s.player.flashlightOn = false;
        s.player.flashlightBattery = 0;
        eventBus.emit("FLASHLIGHT_TOGGLED", { on: false, battery: 0 });
      }
    }

    this.recomputeFOV();
  }

  recomputeFOV(): void {
    const s = this.getState();
    const room = s.rooms.get(s.player.roomId);
    if (!room) return;
    const ambient: AmbientLightLevel = room.ambientLight;
    const radius = getEffectivePlayerRadius(ambient, s.player.flashlightOn);
    s.visibleTiles.clear();
    // Inside a locker the player can't see the room — only their own tile.
    if (s.player.hidingTileKey) {
      s.visibleTiles.add(`${s.player.pos.x},${s.player.pos.y}`);
      rememberVisible(s, room.id);
      eventBus.emit("FOV_UPDATED", {
        roomId: room.id,
        visibleTiles: Array.from(s.visibleTiles),
      });
      eventBus.emit("AMBIENT_LIGHT_CHANGED", {
        roomId: room.id,
        level: ambient,
        effectiveRadius: 0,
      });
      return;
    }
    const visible = computeCone({
      tiles: room.tiles,
      width: room.width,
      height: room.height,
      ox: s.player.pos.x,
      oy: s.player.pos.y,
      radius,
    });
    for (const k of visible) s.visibleTiles.add(k);
    // Peek: union an extra narrow cone in the peek direction with a +2 radius
    // bonus, so the player can see further than they could from this tile.
    if (s.player.peeking) {
      const peekVisible = computeCone({
        tiles: room.tiles,
        width: room.width,
        height: room.height,
        ox: s.player.pos.x,
        oy: s.player.pos.y,
        radius: radius + 2,
        facing: s.player.peeking,
        halfAngle: Math.PI / 3,
      });
      for (const k of peekVisible) s.visibleTiles.add(k);
    }
    rememberVisible(s, room.id);
    eventBus.emit("FOV_UPDATED", {
      roomId: room.id,
      visibleTiles: Array.from(s.visibleTiles),
    });
    eventBus.emit("AMBIENT_LIGHT_CHANGED", {
      roomId: room.id,
      level: ambient,
      effectiveRadius: radius,
    });
  }

  isVisible(pos: Vec2): boolean {
    return this.getState().visibleTiles.has(`${pos.x},${pos.y}`);
  }
}

export const worldEngine = new WorldEngine();
