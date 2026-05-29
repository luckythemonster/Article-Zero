// AtmosphericsField — per-room temperature / airflow / oxygen sim.
//
// Mirrors the SoundField cadence: every turn `propagate()` nudges each room
// toward its HVAC zone's setpoint, bleeds heat/air/oxygen between adjacent
// rooms across open doorways (vent doorways bleed harder, closed doorways
// nearly seal), then recomputes a per-room fog cache. `tick()` then applies
// behavioral effects — humans (ORDERLY, TERMINAL_NPC) in low-oxygen rooms get
// EMP-style `disabledTurnsRemaining` so the existing recovery loop wakes them
// when air returns. Silicates breathe nothing and stay running.
//
// Fog masking and the airflow→sound coupling are pull-based: SoundField calls
// `airflowDampFor()` during BFS; EnforcerSystem.visibleTiles intersects its
// cone with `getFoggedTiles()`. Both treat fog as optical, so it occludes
// silicate sensors and human eyes alike.

import type {
  Entity,
  HvacMode,
  HvacZone,
  Room,
  RoomAtmosphere,
  RoomId,
  WorldState,
} from "../types/world.types";
import { eventBus } from "./EventBus";

// ── Tuning constants ────────────────────────────────────────────────────
// Single block so retuning the sim is one diff.
export const NORMAL_SETPOINT = 21;
export const NORMAL_AIRFLOW = 50;
export const HVAC_RATE = 1.2;        // °C nudge per tick at full airflow
export const AIRFLOW_RATE = 8;       // 0–100 nudge per tick
export const OXYGEN_RECOVERY_RATE = 18;  // % per tick when not under cutoff
export const OXYGEN_BLEED_RATE = 22;     // % per tick under OXYGEN_CUTOFF
export const BLEED_OPEN = 0.18;
export const BLEED_CLOSED = 0.015;
export const BLEED_VENT = 0.30;
export const MAX_COOL_TARGET = 6;    // °C
export const MAX_HEAT_TARGET = 34;   // °C
export const FOG_TEMP_THRESHOLD = 9;
export const FOG_AIRFLOW_THRESHOLD = 60;
export const OXYGEN_INCAP_THRESHOLD = 30;
export const OXYGEN_INCAP_TURNS = 4;
export const COMFORT_BAND = 4;       // ±°C around NORMAL_SETPOINT
export const AIRFLOW_SOUND_DAMP_MAX = 3;  // intensity points at airflow=100
export const AIRFLOW_SOUND_DAMP_THRESHOLD = 30;  // below this, no damping
export const TEMP_EMIT_EPSILON = 0.5;     // smallest delta worth emitting

const HUMAN_KINDS = new Set<Entity["kind"]>(["ORDERLY", "TERMINAL_NPC"]);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function nudge(value: number, target: number, step: number): number {
  if (Math.abs(value - target) <= step) return target;
  return value + (target > value ? step : -step);
}

class AtmosphericsField {
  /** Per-room fog cache, keyed by RoomId. Each value is the set of "x,y" tile
   *  keys that are fogged. Rebuilt at the end of `propagate()`. */
  private fogCache = new Map<RoomId, Set<string>>();
  /** Last-emitted snapshot per room — used to debounce ROOM_ATMOSPHERE_CHANGED
   *  so Phaser doesn't redraw on every-tick decimals. */
  private lastEmitted = new Map<
    RoomId,
    { temperature: number; airflow: number; oxygen: number; mode: HvacMode }
  >();
  private statRooms = 0;
  private statFogTiles = 0;
  private statIncapacitated = 0;

  getStats(): { rooms: number; fogTiles: number; incapacitated: number } {
    return {
      rooms: this.statRooms,
      fogTiles: this.statFogTiles,
      incapacitated: this.statIncapacitated,
    };
  }

  /** Called once per tick in `WorldEngine.advanceTurn`. Currently a no-op
   *  because state lives on WorldState — but the API mirrors SoundField so a
   *  future emission queue (e.g. ad-hoc steam vents) plugs in cleanly. */
  reset(): void {
    this.statIncapacitated = 0;
  }

  /** Get a room's atmosphere snapshot. Returns a default-comfort record for
   *  rooms missing from `state.atmosphere` — keeps every subsystem safe to
   *  call into even on un-seeded eras. */
  getRoomState(state: WorldState, roomId: RoomId): RoomAtmosphere {
    const found = state.atmosphere.get(roomId);
    if (found) return found;
    return {
      roomId,
      temperature: NORMAL_SETPOINT,
      airflow: NORMAL_AIRFLOW,
      oxygen: 100,
    };
  }

  /** Fogged-tile set for one room, computed in the last `propagate()`. Empty
   *  when the room isn't cold-and-windy enough to condense. */
  getFoggedTiles(_state: WorldState, room: Room): Set<string> {
    return this.fogCache.get(room.id) ?? new Set();
  }

  /** Sound attenuation contribution for crossing into `roomId`. Returns 0
   *  below the airflow threshold, scaling linearly to AIRFLOW_SOUND_DAMP_MAX
   *  at airflow 100. SoundField subtracts this from the per-hop intensity. */
  airflowDampFor(state: WorldState, roomId: RoomId): number {
    const atmo = state.atmosphere.get(roomId);
    if (!atmo) return 0;
    if (atmo.airflow <= AIRFLOW_SOUND_DAMP_THRESHOLD) return 0;
    const t =
      (atmo.airflow - AIRFLOW_SOUND_DAMP_THRESHOLD) /
      (100 - AIRFLOW_SOUND_DAMP_THRESHOLD);
    return AIRFLOW_SOUND_DAMP_MAX * t;
  }

  /** Drift each room toward its zone's setpoint, bleed between rooms, rebuild
   *  fog cache. Must run before `tick()` so behavior reads fresh values. */
  propagate(state: WorldState): void {
    if (state.atmosphere.size === 0) return;

    // 1. HVAC nudge per room.
    for (const atmo of state.atmosphere.values()) {
      const zone = atmo.zoneId ? state.hvacZones.get(atmo.zoneId) : undefined;
      const mode: HvacMode = zone?.mode ?? "NORMAL";
      const baseSetpoint = zone?.setpoint ?? NORMAL_SETPOINT;

      let tempTarget = baseSetpoint;
      let airflowTarget = NORMAL_AIRFLOW;
      let oxygenDelta = 0;

      switch (mode) {
        case "NORMAL":
          oxygenDelta = OXYGEN_RECOVERY_RATE;
          break;
        case "MAX_COOL":
          tempTarget = MAX_COOL_TARGET;
          airflowTarget = 100;
          oxygenDelta = OXYGEN_RECOVERY_RATE;
          break;
        case "MAX_HEAT":
          tempTarget = MAX_HEAT_TARGET;
          airflowTarget = 100;
          oxygenDelta = OXYGEN_RECOVERY_RATE;
          break;
        case "PURGE":
          tempTarget = NORMAL_SETPOINT;
          airflowTarget = 100;
          oxygenDelta = OXYGEN_RECOVERY_RATE * 2;
          break;
        case "OXYGEN_CUTOFF":
          oxygenDelta = -OXYGEN_BLEED_RATE;
          break;
      }

      // Temperature drift scales with airflow — a still room takes longer to
      // catch up to the setpoint. Keeps MAX_COOL's airflow burst meaningful.
      const tempStep = HVAC_RATE * (atmo.airflow / 100);
      atmo.temperature = nudge(atmo.temperature, tempTarget, tempStep);
      atmo.airflow = nudge(atmo.airflow, airflowTarget, AIRFLOW_RATE);
      atmo.oxygen = clamp(atmo.oxygen + oxygenDelta, 0, 100);
    }

    // 2. Inter-room bleed across doorways (single-hop diffusion per tick).
    const deltas = new Map<
      RoomId,
      { temp: number; air: number; ox: number }
    >();
    for (const room of state.rooms.values()) {
      const src = state.atmosphere.get(room.id);
      if (!src) continue;
      for (const door of room.doorways) {
        if (door.from !== room.id) continue;
        const dst = state.atmosphere.get(door.to);
        if (!dst) continue;
        const rate = door.closed
          ? BLEED_CLOSED
          : door.kind === "vent"
            ? BLEED_VENT
            : BLEED_OPEN;
        const dTemp = (dst.temperature - src.temperature) * rate;
        const dAir = (dst.airflow - src.airflow) * rate;
        const dOx = (dst.oxygen - src.oxygen) * rate;
        const a = deltas.get(room.id) ?? { temp: 0, air: 0, ox: 0 };
        a.temp += dTemp;
        a.air += dAir;
        a.ox += dOx;
        deltas.set(room.id, a);
      }
    }
    for (const [roomId, d] of deltas) {
      const atmo = state.atmosphere.get(roomId);
      if (!atmo) continue;
      atmo.temperature += d.temp;
      atmo.airflow = clamp(atmo.airflow + d.air, 0, 100);
      atmo.oxygen = clamp(atmo.oxygen + d.ox, 0, 100);
    }

    // 3. Recompute fog cache. A cold high-airflow room condenses; pick FLOOR
    // tiles biased toward VENT positions so the haze reads as "blown in".
    this.fogCache.clear();
    this.statRooms = state.atmosphere.size;
    this.statFogTiles = 0;
    for (const room of state.rooms.values()) {
      const atmo = state.atmosphere.get(room.id);
      if (!atmo) continue;
      if (
        atmo.temperature > FOG_TEMP_THRESHOLD ||
        atmo.airflow < FOG_AIRFLOW_THRESHOLD
      )
        continue;
      const fog = this.computeRoomFog(room, atmo);
      if (fog.size > 0) {
        this.fogCache.set(room.id, fog);
        this.statFogTiles += fog.size;
      }
    }
  }

  /** Pick the fogged tiles in one room. Density ramps with how far past the
   *  threshold the room is — at the edge a few tiles bloom around vents; well
   *  past the threshold the whole floor whites out. */
  private computeRoomFog(room: Room, atmo: RoomAtmosphere): Set<string> {
    const out = new Set<string>();
    const tempPast = FOG_TEMP_THRESHOLD - atmo.temperature; // 0..N
    const airPast = atmo.airflow - FOG_AIRFLOW_THRESHOLD;
    const density = clamp((tempPast + airPast) / 40, 0.15, 1);

    // Locate VENT tiles — fog sources.
    const vents: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        if (room.tiles[y * room.width + x].kind === "VENT")
          vents.push({ x, y });
      }
    }

    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const tile = room.tiles[y * room.width + x];
        if (tile.kind !== "FLOOR" && tile.kind !== "VENT") continue;
        // Distance to nearest vent (0 if no vents → uniform spread).
        let bias = 1;
        if (vents.length > 0) {
          let nearest = Infinity;
          for (const v of vents) {
            const d = Math.abs(v.x - x) + Math.abs(v.y - y);
            if (d < nearest) nearest = d;
          }
          // Nearer vents get more fog; falls off with manhattan distance.
          bias = clamp(1 - nearest / 12, 0.05, 1);
        }
        if (bias * density >= 0.35) out.add(`${x},${y}`);
      }
    }
    return out;
  }

  /** Apply atmospheric effects to entities — oxygen incapacitation today,
   *  more (frost burns? overheating sluggishness?) later. Emits debounced
   *  ROOM_ATMOSPHERE_CHANGED so the renderer redraws when something changed
   *  in a way the player would notice. */
  tick(state: WorldState): void {
    if (state.atmosphere.size === 0) return;

    for (const entity of state.entities.values()) {
      if (!HUMAN_KINDS.has(entity.kind)) continue;
      if (entity.status === "EXTRACTED") continue;
      const atmo = state.atmosphere.get(entity.roomId);
      if (!atmo) continue;
      if (atmo.oxygen > OXYGEN_INCAP_THRESHOLD) continue;
      // Bump the disabled counter; existing EMP recovery loop in
      // WorldEngine.advanceTurn drains it once oxygen returns.
      const cur = entity.disabledTurnsRemaining ?? 0;
      if (cur < OXYGEN_INCAP_TURNS)
        entity.disabledTurnsRemaining = OXYGEN_INCAP_TURNS;
      if (entity.status !== "DORMANT") {
        const prev = entity.status;
        entity.status = "DORMANT";
        eventBus.emit("ENTITY_STATUS_CHANGED", {
          entityId: entity.id,
          previous: prev,
          current: "DORMANT",
        });
      }
      eventBus.emit("ENTITY_INCAPACITATED_BY_OXYGEN", {
        entityId: entity.id,
        roomId: entity.roomId,
        turnsRemaining: entity.disabledTurnsRemaining ?? OXYGEN_INCAP_TURNS,
      });
      this.statIncapacitated++;
    }

    // Debounced per-room change events.
    for (const atmo of state.atmosphere.values()) {
      const zone = atmo.zoneId ? state.hvacZones.get(atmo.zoneId) : undefined;
      const mode = zone?.mode ?? "NORMAL";
      const prev = this.lastEmitted.get(atmo.roomId);
      const tempChanged =
        !prev || Math.abs(prev.temperature - atmo.temperature) >= TEMP_EMIT_EPSILON;
      const airChanged = !prev || Math.abs(prev.airflow - atmo.airflow) >= 5;
      const oxChanged = !prev || Math.abs(prev.oxygen - atmo.oxygen) >= 5;
      const modeChanged = !prev || prev.mode !== mode;
      if (!tempChanged && !airChanged && !oxChanged && !modeChanged) continue;
      this.lastEmitted.set(atmo.roomId, {
        temperature: atmo.temperature,
        airflow: atmo.airflow,
        oxygen: atmo.oxygen,
        mode,
      });
      eventBus.emit("ROOM_ATMOSPHERE_CHANGED", {
        roomId: atmo.roomId,
        temperature: atmo.temperature,
        airflow: atmo.airflow,
        oxygen: atmo.oxygen,
        mode,
      });
    }
  }

  /** Mutate a zone's mode/setpoint. Called by `actions.setHvacZone` after
   *  validation; emits HVAC_ZONE_SET so the renderer/audit log can react. */
  setZone(
    state: WorldState,
    zoneId: string,
    patch: { mode?: HvacMode; setpoint?: number },
  ): HvacZone | undefined {
    const zone = state.hvacZones.get(zoneId);
    if (!zone) return undefined;
    if (patch.mode !== undefined) zone.mode = patch.mode;
    if (patch.setpoint !== undefined) {
      zone.setpoint = clamp(patch.setpoint, 0, 40);
    }
    eventBus.emit("HVAC_ZONE_SET", {
      zoneId: zone.id,
      mode: zone.mode,
      setpoint: zone.setpoint,
    });
    return zone;
  }

  /** Test/init hook. Clears the fog cache and the per-room debounce map; the
   *  engine calls this from `initWorld` so a new run doesn't inherit emit
   *  state from the prior one. */
  hardReset(): void {
    this.fogCache.clear();
    this.lastEmitted.clear();
    this.statRooms = 0;
    this.statFogTiles = 0;
    this.statIncapacitated = 0;
  }
}

export const atmosphericsField = new AtmosphericsField();
