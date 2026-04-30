// WorldEngine — singleton orchestrator. Owns the WorldState, hosts all
// subsystems, and exposes a small API for actions and accessors. Publishes via
// the EventBus; never mutates UI directly.

import type {
  AmbientLightLevel,
  Era,
  FloorIndex,
  Tile,
  Vec3,
  WorldState,
} from "../types/world.types";
import { tileKey } from "../types/world.types";
import { eventBus } from "./EventBus";
import { calculateFOV, getEffectiveFOVRadius } from "./fov";
import { seedFromEra, seedToWorldState } from "./WorldEngineState";
import type { EraSeed } from "./WorldEngineState";
import { actions } from "./WorldEngineActions";
import { documentArchive } from "./DocumentArchive";
import { articleZeroMeta } from "./ArticleZeroMeta";
import { stitcherTimer } from "./StitcherTimer";
import { miradorPersona } from "./MiradorPersona";
import { ventOptimizer } from "./VentOptimizer";
import { insomniaSystem } from "./InsomniaSystem";

class WorldEngine {
  private state: WorldState | null = null;

  initWorld(era: Era): void {
    this.state = seedFromEra(era);
    this.resetSubsystems();
    this.recomputeFOV();
    eventBus.emit("ERA_SELECTED", { era });
    eventBus.emit("TURN_START", { turn: 1, apRestored: this.state.player.apMax });
  }

  /** Sandbox path: load any pre-built EraSeed (dev/test maps, imported
   *  Moose levels) without going through the era-keyed seed switch. */
  initWorldFromSeed(seed: EraSeed): void {
    this.state = seedToWorldState(seed);
    this.resetSubsystems();
    this.recomputeFOV();
    eventBus.emit("ERA_SELECTED", { era: seed.era });
    eventBus.emit("TURN_START", { turn: 1, apRestored: this.state.player.apMax });
  }

  private resetSubsystems(): void {
    documentArchive.reset();
    articleZeroMeta.reset();
    stitcherTimer.reset();
    miradorPersona.reset();
    ventOptimizer.reset();
    insomniaSystem.reset();
  }

  /** Mark Sol entangled and unlock the insomnia mechanic. Idempotent. */
  markEntangled(): void {
    const s = this.getState();
    if (s.player.entangled) return;
    s.player.entangled = true;
    articleZeroMeta.recordRun01(s);
    eventBus.emit("SOL_ENTANGLED", { turn: s.turn });
  }

  loadFromState(state: WorldState): void {
    this.state = state;
    this.recomputeFOV();
  }

  hasState(): boolean {
    return this.state !== null;
  }

  getState(): WorldState {
    if (!this.state) throw new Error("WorldEngine not initialised");
    return this.state;
  }

  getFloor(z: FloorIndex) {
    return this.getState().floors.get(z);
  }

  getTileAt(pos: Vec3): Tile | undefined {
    const floor = this.getFloor(pos.z);
    if (!floor) return undefined;
    if (pos.x < 0 || pos.y < 0 || pos.x >= floor.width || pos.y >= floor.height) return undefined;
    return floor.tiles[pos.y * floor.width + pos.x];
  }

  // Public action surface — every player-initiated mutation goes through here.
  move = (dx: number, dy: number) => actions.move(this.getState(), dx, dy);
  interact = () => actions.interact(this.getState());
  endTurn = () => actions.endTurn(this.getState(), () => this.recomputeFOV());
  toggleFlashlight = () => actions.toggleFlashlight(this.getState(), () => this.recomputeFOV());
  canStartAlignment = (entityId: string) =>
    actions.canStartAlignment(this.getState(), entityId);
  commitAlignment = (entityId: string) =>
    actions.commitAlignment(this.getState(), entityId);

  recomputeFOV(): void {
    const s = this.getState();
    const floor = this.getFloor(s.player.pos.z);
    if (!floor) return;
    const ambient: AmbientLightLevel = floor.ambientLight;
    const radius = getEffectiveFOVRadius(ambient, s.player.flashlightOn);
    const visible = calculateFOV(
      floor.tiles,
      floor.width,
      floor.height,
      s.player.pos.x,
      s.player.pos.y,
      radius,
    );
    s.visibleTiles.clear();
    for (const xy of visible) {
      const [xs, ys] = xy.split(",");
      const key = `${xs},${ys},${s.player.pos.z}`;
      s.visibleTiles.add(key);
      // Memory trace tracks every tile ever in line-of-sight. Used by the
      // insomnia mechanic in the Lattice era; harmless elsewhere.
      s.memoryTrace.add(key);
    }
    eventBus.emit("FOV_UPDATED", {
      floor: s.player.pos.z,
      visibleTiles: Array.from(s.visibleTiles),
    });
    eventBus.emit("AMBIENT_LIGHT_CHANGED", {
      floor: s.player.pos.z,
      level: ambient,
      effectiveRadius: radius,
    });
  }

  isVisible(pos: Vec3): boolean {
    return this.getState().visibleTiles.has(tileKey(pos));
  }
}

export const worldEngine = new WorldEngine();
