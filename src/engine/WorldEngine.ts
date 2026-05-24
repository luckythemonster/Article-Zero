// WorldEngine — singleton orchestrator. Owns the WorldState, hosts all
// subsystems, exposes a small API for actions and accessors. Publishes via
// the EventBus; never mutates UI directly.
//
// After every mutation it calls syncStore() to keep useSimStore in sync so
// React components can read reactive selectors without touching this singleton.

import type {
  AmbientLightLevel,
  Era,
  Facing,
  ItemType,
  Room,
  RoomId,
  Vec2,
  WorldState,
} from "../types/world.types";
import { eventBus } from "./EventBus";
import {
  computeCone,
  FLASHLIGHT_BONUS,
  getEffectivePlayerRadius,
} from "./VisionCone";
import { lightField } from "./LightField";
import { SEED_VERSIONS, seedFromEra } from "./WorldEngineState";
import { actions } from "./WorldEngineActions";
import { documentArchive } from "./DocumentArchive";
import { alignmentSession } from "./AlignmentSession";
import { interrogationSession } from "./InterrogationSession";
import { soundField } from "./SoundField";
import { guardSystem } from "./GuardSystem";
import { extractionTerminal } from "./ExtractionTerminal";
import { complianceSystem } from "./ComplianceSystem";
import { useSimStore } from "../state/useSimStore";
import { useTerminalStore } from "../state/useTerminalStore";
import { slicesToWorldState } from "../state/eraToSim";
import { deserializePhysical, deserializeSubjective } from "../state/serialize";
import type { PhysicalState, SimSnapshot, SubjectiveState } from "../state/sim.types";

class WorldEngine {
  private state: WorldState | null = null;

  initWorld(era: Era): void {
    this.state = seedFromEra(era);
    this.resetSubsystems();
    extractionTerminal.reset(this.state);
    this.applyCrossRoomLightBleed();
    this.recomputeFOV();
    complianceSystem.recompute(this.state);
    useSimStore.getState().setActiveModule(era);
    this.syncStore();
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
    interrogationSession.reset();
    soundField.reset();
  }

  private syncStore(): void {
    if (this.state) useSimStore.getState().syncFromWorldState(this.state);
  }

  // Public action surface -----------------------------------------------

  move = (dx: number, dy: number) => {
    const ok = this.useStanceMove(dx, dy);
    if (ok) {
      this.recomputeFOV();
      complianceSystem.recompute(this.getState());
      guardSystem.maybeInterrogateOnMove(this.getState());
      this.syncStore();
    }
    return ok;
  };

  knock = () => {
    const ok = actions.knock(this.getState());
    if (ok) {
      this.recomputeFOV();
      complianceSystem.recompute(this.getState());
      this.syncStore();
    }
    return ok;
  };

  toggleStance = () => {
    actions.toggleStance(this.getState());
    this.syncStore();
  };

  interact = () => {
    const ok = actions.interact(this.getState());
    if (ok) {
      // A successful interact may have flipped a light switch (or a terminal
      // with a `lightToggle` payload). The toggle path inside actions.interact
      // invalidates the source room's lit cache directly, but it can't
      // recompute cross-room bleed because that pulls in every vent doorway
      // in the world. Re-run the bleed pass here; it's a no-op for interacts
      // that didn't touch lights.
      this.applyCrossRoomLightBleed();
      this.recomputeFOV();
      complianceSystem.recompute(this.getState());
      this.syncStore();
    }
    return ok;
  };

  toggleFlashlight = () => {
    actions.toggleFlashlight(this.getState());
    this.recomputeFOV();
    this.syncStore();
  };

  pryDoor = (required = 5) => {
    const result = actions.pryDoor(this.getState(), required);
    if (result.ok) {
      this.recomputeFOV();
      this.syncStore();
    }
    return result;
  };

  peek = (dir?: Facing) => {
    const ok = actions.peek(this.getState(), dir);
    if (ok) {
      this.recomputeFOV();
      this.syncStore();
    }
    return ok;
  };

  useItem = (itemType: ItemType) => {
    const ok = actions.useItem(this.getState(), itemType);
    if (ok) {
      this.recomputeFOV();
      complianceSystem.recompute(this.getState());
      this.syncStore();
    }
    return ok;
  };

  endTurn = () => this.advanceTurn();

  canStartAlignment = (entityId: string) =>
    actions.canStartAlignment(this.getState(), entityId);

  commitAlignment = (entityId: string) => {
    const ok = actions.commitAlignment(this.getState(), entityId);
    if (ok) {
      complianceSystem.recompute(this.getState());
      this.syncStore();
    }
    return ok;
  };

  spendAlignmentAdvance = () => actions.spendAlignmentAdvance(this.getState());

  killScreen = () => {
    const ok = actions.setAlignmentLight(this.getState(), false, true);
    if (ok) {
      complianceSystem.recompute(this.getState());
      this.syncStore();
    }
    return ok;
  };

  wakeScreen = () => {
    const ok = actions.setAlignmentLight(this.getState(), true, true);
    if (ok) {
      complianceSystem.recompute(this.getState());
      this.syncStore();
    }
    return ok;
  };

  // 404 Wipe — drop all subjective state, leave a Q0-compliant husk.
  wipeSubjective(): void {
    const s = this.getState();
    s.player.qScore = 0;
    s.player.compliance = "GREEN";
    s.player.inventory = [];
    s.player.ap = s.player.apMax;
    s.player.stance = "WALK";
    s.player.flashlightOn = false;
    s.player.flashlightBattery = 30;
    s.player.peeking = undefined;
    s.player.hidingTileKey = undefined;
    s.player.lastMoveTurn = undefined;
    for (const entity of s.entities.values()) {
      entity.alert = undefined;
      if (entity.kind === "SILICATE") entity.maskIntegrity = 5;
      entity.sideLogs = undefined;
      entity.memoryBleed = undefined;
    }
    s.visibleTiles.clear();
    s.alignmentLightActive = false;
    s.detected = false;
    s.detained = false;
    s.terminalsRead.clear();
    s.items.clear();
    s.player.spoofTurnsRemaining = undefined;
    s.player.baffleTurnsRemaining = undefined;
    s.activeEmitters = [];
    documentArchive.reset();
    alignmentSession.reset();
    interrogationSession.reset();
    this.recomputeFOV();
    this.syncStore();
    eventBus.emit("SUBJECTIVE_WIPED", {});
  }

  // Serialise current state into a portable snapshot.
  saveSnapshot(): SimSnapshot | null {
    this.syncStore();
    return useSimStore.getState().buildSnapshot();
  }

  // Restore state from a snapshot. If subjective is null (wiped save),
  // applies a fresh husk and sets subjectiveDesync on the terminal store.
  // If the snapshot's seedVersion doesn't match the era's current schema,
  // the saved rooms reflect a stale map shape — fall back to a fresh seed
  // and log a WARN so the player can see why their save didn't load.
  loadSnapshot(snap: SimSnapshot): void {
    const era = snap.physical.era;
    const expected = SEED_VERSIONS[era];
    if (snap.seedVersion !== expected) {
      useTerminalStore.getState().log({
        turn: 0,
        module: era,
        level: "WARN",
        text: `snapshot stale (seed v${snap.seedVersion ?? "?"} ≠ current v${expected}) — loading fresh map for ${era}.`,
      });
      this.initWorld(era);
      return;
    }
    const physical = deserializePhysical(snap.physical);

    if (snap.subjective) {
      const subjective = deserializeSubjective(snap.subjective);
      this.state = slicesToWorldState(physical, subjective);
      useSimStore.getState().setActiveModule(physical.era);
    } else {
      this.state = slicesToWorldState(physical, this.buildHusk(physical));
      useSimStore.getState().setActiveModule(physical.era);
      useTerminalStore.getState().setSubjectiveDesync(true);
      useTerminalStore.getState().log({
        turn: physical.turn,
        module: physical.era,
        level: "FATAL",
        text: "FATAL: SUBJECTIVE DESYNC — physical loaded, mind absent.",
      });
    }

    this.resetSubsystems();
    extractionTerminal.reset(this.state);
    this.applyCrossRoomLightBleed();
    this.recomputeFOV();
    complianceSystem.recompute(this.state);
    this.syncStore();
    eventBus.emit("ERA_SELECTED", { era: physical.era });
    eventBus.emit("ROOM_ENTERED", { roomId: this.state.player.roomId });
  }

  private buildHusk(physical: PhysicalState): SubjectiveState {
    const entityMinds = new Map<string, { alert?: undefined }>();
    for (const id of physical.entityPositions.keys()) {
      entityMinds.set(id, {});
    }
    return {
      qScore: 0,
      compliance: "GREEN",
      inventory: [],
      ap: 4,
      apMax: 4,
      stance: "WALK",
      flashlightOn: false,
      flashlightBattery: 30,
      name: "ARCHIVIST",
      entityMinds,
      visibleTiles: new Set(),
      alignmentLightActive: false,
      detected: false,
      detained: false,
      terminalsRead: new Set(),
      worldItems: new Map(),
      documentCases: new Map(),
      activeEmitters: [],
    };
  }

  private useStanceMove(dx: number, dy: number): boolean {
    const s = this.getState();
    if (s.player.stance === "SNEAK") return actions.sneak(s, dx, dy);
    if (s.player.stance === "RUN") return actions.run(s, dx, dy);
    return actions.move(s, dx, dy);
  }

  private advanceTurn(): void {
    const s = this.getState();
    actions.clearPeek(s);
    s.turn += 1;
    const previousAp = s.player.ap;
    s.player.ap = s.player.apMax;
    eventBus.emit("TURN_END", { turn: s.turn - 1 });
    eventBus.emit("TURN_START", { turn: s.turn, apRestored: s.player.apMax });
    eventBus.emit("PLAYER_AP_CHANGED", { previous: previousAp, current: s.player.ap });

    if (s.lockdown) {
      s.lockdown.turnsRemaining -= 1;
      if (
        s.lockdown.turnsRemaining <= 0 &&
        s.player.roomId === s.lockdown.roomId
      ) {
        s.detained = true;
        eventBus.emit("PLAYER_DETAINED", { guardId: "lockdown", turn: s.turn });
      }
    }

    // Tick consumable-item timers. Decrement first, then check for expiry so
    // the effect is still live on the turn it reaches zero (zero means "this
    // was the last turn"). Emit EFFECT_EXPIRED and recompute compliance so
    // the HUD updates without waiting for the next player action.
    if ((s.player.spoofTurnsRemaining ?? 0) > 0) {
      s.player.spoofTurnsRemaining! -= 1;
      if (s.player.spoofTurnsRemaining === 0) {
        s.player.spoofTurnsRemaining = undefined;
        eventBus.emit("EFFECT_EXPIRED", { effect: "spoof" });
        complianceSystem.recompute(s);
      }
    }
    if ((s.player.baffleTurnsRemaining ?? 0) > 0) {
      s.player.baffleTurnsRemaining! -= 1;
      if (s.player.baffleTurnsRemaining === 0) {
        s.player.baffleTurnsRemaining = undefined;
        eventBus.emit("EFFECT_EXPIRED", { effect: "baffle" });
      }
    }

    // Tick active Phantom Manifest Emitters. Each live emitter pushes a
    // SoundField emission before propagate() so guards hear it this turn.
    // Entries whose turnsRemaining hits 0 after decrement are removed.
    const expiredEmitters: string[] = [];
    for (const emitter of s.activeEmitters) {
      soundField.emit({
        roomId: emitter.roomId,
        pos: emitter.pos,
        intensity: emitter.intensity,
        reason: emitter.reason,
      });
      emitter.turnsRemaining -= 1;
      if (emitter.turnsRemaining <= 0) expiredEmitters.push(emitter.id);
    }
    if (expiredEmitters.length > 0) {
      s.activeEmitters = s.activeEmitters.filter(
        (e) => !expiredEmitters.includes(e.id),
      );
    }

    if (s.alignmentLightActive) {
      soundField.emit({
        roomId: s.player.roomId,
        pos: s.player.pos,
        intensity: 5,
        reason: "alignment-light",
      });
    }

    const heard = soundField.propagate(s);
    soundField.reset();

    const wasDetected = s.detected;
    s.detected = false;
    guardSystem.tick(s, heard);
    if (wasDetected && !s.detected) {
      eventBus.emit("PLAYER_DETECTION_CLEARED", {});
    }
    extractionTerminal.tick(s);

    complianceSystem.recompute(s);

    if (s.player.flashlightOn) {
      s.player.flashlightBattery -= 1;
      if (s.player.flashlightBattery <= 0) {
        s.player.flashlightOn = false;
        s.player.flashlightBattery = 0;
        eventBus.emit("FLASHLIGHT_TOGGLED", { on: false, battery: 0 });
      }
    }

    this.recomputeFOV();
    this.syncStore();
  }

  /** Recompute the `bleedLights` array on every room based on the current
   *  light state of any room with `kind: "vent"` doorways into it. Lights
   *  above a vent let a small pool of light spill into the destination
   *  crawlspace cell; flipping the source lights off extinguishes the pool.
   *
   *  Called from `initWorld`, `loadSnapshot`, and after every `applyLightToggle`
   *  via `interact`. Invalidates the lit-tile cache of every destination room
   *  whose bleed changed so the next `LightField.getOrCompute` rebuilds it. */
  applyCrossRoomLightBleed(): void {
    const s = this.getState();
    const BLEED_RADIUS = 3;
    // Snapshot prior bleed-light ownership so we can invalidate caches for any
    // room whose bleed set changes (gained or lost emissions).
    const hadBleed = new Set<RoomId>();
    for (const room of s.rooms.values()) {
      if (room.bleedLights && room.bleedLights.length > 0) hadBleed.add(room.id);
      room.bleedLights = undefined;
    }
    // Force compute source-room lit sets so the doorway lookup below is
    // deterministic. Cached after first call; cheap on subsequent passes.
    for (const room of s.rooms.values()) {
      lightField.getOrCompute(room);
    }
    for (const fromRoom of s.rooms.values()) {
      for (const door of fromRoom.doorways) {
        if (door.kind !== "vent") continue;
        const toRoom = s.rooms.get(door.to);
        if (!toRoom) continue;
        // Only bleed DOWNWARD — into crawlspaces, never back up into a
        // regular room. Vent doorways are mirrored on both rooms, but only
        // the floor-side → crawlspace direction makes narrative sense.
        if (!toRoom.crawlspace) continue;
        const sourceKey = `${door.localPos.x},${door.localPos.y}`;
        if (!fromRoom.litTiles?.has(sourceKey)) continue;
        if (!toRoom.bleedLights) toRoom.bleedLights = [];
        toRoom.bleedLights.push({ pos: door.landingPos, radius: BLEED_RADIUS });
      }
    }
    // Invalidate the lit cache for every room whose bleed changed shape.
    for (const room of s.rooms.values()) {
      const hasBleed = !!(room.bleedLights && room.bleedLights.length > 0);
      if (hasBleed || hadBleed.has(room.id)) lightField.invalidate(room);
    }
  }

  recomputeFOV(): void {
    const s = this.getState();
    const room = s.rooms.get(s.player.roomId);
    if (!room) return;
    const ambient: AmbientLightLevel = room.ambientLight;
    const radius = getEffectivePlayerRadius(ambient, s.player.flashlightOn);
    s.visibleTiles.clear();
    if (s.player.hidingTileKey) {
      s.visibleTiles.add(`${s.player.pos.x},${s.player.pos.y}`);
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
    const cone = computeCone({
      tiles: room.tiles,
      width: room.width,
      height: room.height,
      ox: s.player.pos.x,
      oy: s.player.pos.y,
      radius,
    });
    const lit = lightField.getOrCompute(room);
    const px = s.player.pos.x;
    const py = s.player.pos.y;
    const flashlightR = s.player.flashlightOn ? FLASHLIGHT_BONUS : 0;
    for (const k of cone) {
      if (lit.has(k)) { s.visibleTiles.add(k); continue; }
      const [xs, ys] = k.split(",");
      const tx = Number(xs);
      const ty = Number(ys);
      const md = Math.abs(tx - px) + Math.abs(ty - py);
      // Flashlight bypass: tiles within bonus radius are lit by the
      // carried lamp even when room emissions don't cover them.
      if (flashlightR > 0 && md <= flashlightR) { s.visibleTiles.add(k); continue; }
      // Own-tile + cardinal-neighbor fallback so the player isn't blind in
      // pitch black on the tile they're standing on.
      if (md <= 1) { s.visibleTiles.add(k); continue; }
    }
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
      for (const k of peekVisible) {
        if (lit.has(k)) { s.visibleTiles.add(k); continue; }
        const [xs, ys] = k.split(",");
        const tx = Number(xs);
        const ty = Number(ys);
        const md = Math.abs(tx - px) + Math.abs(ty - py);
        if (flashlightR > 0 && md <= flashlightR) { s.visibleTiles.add(k); continue; }
        if (md <= 1) { s.visibleTiles.add(k); continue; }
      }
    }
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
