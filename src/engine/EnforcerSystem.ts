// EnforcerSystem — per-tick enforcer behavior.
//
// Reads the `AlertFSM` level for each enforcer, picks a behavior, and steps.
//
// Cross-room pursuit: a enforcer in ALERT will follow the player through OPEN
// doorways, BFS-pathfinding the room graph toward `alert.lastStimulusRoom`.
// Sight triggers the lockdown trap as before, which slams every doorway in
// the player's room shut — so the spotter is trapped in the sealed room with
// the player until the player pries a door open and crosses out (clearing
// the lockdown). Once a door is open, the spotter pursues through it. After
// `ALERT_LOSE_SIGHT_TURNS` ticks without re-sighting, the enforcer drops to
// EVASION; once EVASION decays, `stepPatrol` walks it back to `homeRoomId`
// and resumes the authored patrol route mid-cycle.
//
// Only the spotter pursues. Other enforcers continue to escalate to CAUTION via
// SoundField and orient toward doorways (`stepInvestigate`) without crossing.

import type { ActiveMine, Entity, Facing, Room, RoomId, Tile, TileKind, Vec2, WorldState } from "../types/world.types";
import { facingFromDelta } from "../types/world.types";
import { alertFSM, ALERT_SOUND_THRESHOLD, CAUTION_SOUND_THRESHOLD } from "./AlertFSM";
import { eventBus } from "./EventBus";
import { interrogationSession } from "./InterrogationSession";
import { lightField } from "./LightField";
import { roomGraph } from "./RoomGraph";
import { computeCone, ENFORCER_BASE_RANGE, ENFORCER_CONE_HALF_ANGLE, ENFORCER_PROXIMITY_RADIUS, ORDERLY_BASE_RANGE, ORDERLY_CONE_HALF_ANGLE } from "./VisionCone";
import type { DeliveredSound } from "./SoundField";
import { soundField } from "./SoundField";
import { atmosphericsField, COMFORT_BAND, NORMAL_SETPOINT } from "./AtmosphericsField";
import { debugFlags } from "./debugFlags";

const LOCKDOWN_TURNS = 5;
/** A enforcer with no patrol route sweeps its FOV once every N turns rather than
 *  spinning a quarter-turn every tick. */
const IDLE_SCAN_PERIOD = 3;
/** Tiles a pursuing (ALERT) or searching (EVASION) enforcer covers per turn.
 *  Patrol pace stays at the per-entity `stepsPerTurn` (default 1); only an
 *  enforcer that's onto the player moves at this faster clip. Below the player's
 *  4-tile sprint cap so a flat-out flee still nets ~2 tiles of ground each turn. */
const PURSUE_STEPS_PER_TURN = 2;
/** Turns an Enforcer spends fleeing to the EXFIL_POINT after a Q-mine triggers.
 *  A safety window — generous enough that a defector with a navigable path
 *  reaches the exfil; if it neither escapes nor is detained within this, it
 *  comes to its senses and resumes normal duty. */
const Q_MINE_EXPRESS_TURNS = 10;
/** How close (same room, Euclidean) a peer must be to lock onto an expressing
 *  Enforcer and start pursuing it to detain. */
const EXPRESSING_ACQUIRE_RADIUS = 8;
/** SoundField intensity an orderly emits when calling enforcers. Above
 *  ALERT_SOUND_THRESHOLD (4) by enough that it clears one open doorway
 *  (attenuation 2) and still escalates neighbour-room enforcers to ALERT —
 *  same envelope a drone alarm uses. */
const ORDERLY_ALARM_INTENSITY = ALERT_SOUND_THRESHOLD + 2;
/** Max turns an orderly will keep running toward a terminal before giving up
 *  and shouting from where they are. Generous enough for typical room sizes. */
const ORDERLY_ALARM_RUN_TURNS = 8;
/** Turns the orderly stays silent after raising an alarm before they can
 *  call again. Prevents per-tick alarm spam while the player loiters in view. */
const ORDERLY_ALARM_COOLDOWN_TURNS = 6;

// ── CDN-7 (riot-control) tuning ─────────────────────────────────────────
/** Tiles a sprinting CDN-7 covers per turn when pursuing. One above the
 *  enforcer pursue clip, still under the player's 4-tile sprint cap so the
 *  player can outrun it on a clean run. */
const CDN7_SPRINT_STEPS = 3;
/** Manhattan distance at which CDN-7 commits to anchoring across the corridor
 *  (when ALERT same-room with a clear axial line). */
const CDN7_ANCHOR_TRIGGER_RANGE = 3;
/** Turns CDN-7 holds the impassable anchor before releasing. */
const CDN7_ANCHOR_TURNS = 4;
/** Max range (Manhattan) of the chemical-irritant spray. */
const CDN7_SPRAY_RANGE = 3;
/** Turns between sprays. */
const CDN7_SPRAY_COOLDOWN = 3;
/** Turns the player stays blinded by a spray. */
const CDN7_BLINDNESS_TURNS = 3;

class EnforcerSystem {
  /** Compute the visible-tile set for one enforcer inside its current room.
   *  Masked by the room's lit set — enforcers can't see through unlit tiles. */
  visibleTiles(state: WorldState, enforcer: Entity): Set<string> {
    const room = state.rooms.get(enforcer.roomId);
    if (!room) return new Set();
    if ((enforcer.blindnessTurnsRemaining ?? 0) > 0) {
      return new Set([`${enforcer.pos.x},${enforcer.pos.y}`]);
    }
    const cone = computeCone({
      tiles: room.tiles,
      width: room.width,
      height: room.height,
      ox: enforcer.pos.x,
      oy: enforcer.pos.y,
      radius: this.coneRange(room.ambientLight),
      facing: enforcer.facing,
      halfAngle: ENFORCER_CONE_HALF_ANGLE,
    });
    const lit = lightField.getOrCompute(room);
    const fog = atmosphericsField.getFoggedTiles(state, room);
    const out = new Set<string>();
    const ownKey = `${enforcer.pos.x},${enforcer.pos.y}`;
    for (const k of cone) {
      if (k === ownKey) {
        out.add(k);
        continue;
      }
      if (!lit.has(k)) continue;
      // Fog occludes optical sensors regardless of biology — silicate cameras
      // and human eyes alike. Own-tile is exempt so a sensor in fog still
      // sees itself.
      if (fog.has(k)) continue;
      out.add(k);
    }
    return out;
  }

  /** A light (or set of coupled lights) in `room` was just switched OFF.
   *  Each ACTIVE enforcer in that room reacts — synthetically nudged to CAUTION
   *  toward the darkened spot — but only if it either witnesses the toggle (the
   *  light tile is in its current geometric vision cone, regardless of the now
   *  lost illumination) or it remembers the light being on while in this room.
   *  Deliberately does NOT emit a SoundField click, so the toggle stays local:
   *  enforcers in other rooms never hear it. */
  reactToLightToggleOff(state: WorldState, room: Room, lightPositions: Vec2[]): void {
    if (debugFlags.disableEnforcerAI) return;
    const keys = lightPositions.map((p) => `${p.x},${p.y}`);
    for (const enforcer of state.entities.values()) {
      if (enforcer.kind !== "ENFORCER" || enforcer.status !== "ACTIVE") continue;
      if (enforcer.roomId !== room.id) continue;
      // Witness: the geometric cone (LOS + range + facing) — NOT the lit-masked
      // visible set, since the tile is dark by the time we check here.
      const cone = computeCone({
        tiles: room.tiles,
        width: room.width,
        height: room.height,
        ox: enforcer.pos.x,
        oy: enforcer.pos.y,
        radius: this.coneRange(room.ambientLight),
        facing: enforcer.facing,
        halfAngle: ENFORCER_CONE_HALF_ANGLE,
      });
      let matched = keys.findIndex((k) => cone.has(k));
      if (matched < 0 && enforcer.alert?.seenLights) {
        const seen = enforcer.alert.seenLights;
        matched = keys.findIndex((k) => seen.has(`${room.id}:${k}`));
      }
      if (matched >= 0) {
        alertFSM.step(state, enforcer, {
          seesPlayer: false,
          heardIntensity: CAUTION_SOUND_THRESHOLD,
          heardSrc: { roomId: room.id, pos: lightPositions[matched] },
          playerPos: undefined,
          playerRoomId: state.player.roomId,
        });
      }
    }
    // The lights are off now — forget them everywhere so a later re-toggle
    // can't fire on a stale "seen on" record.
    for (const enforcer of state.entities.values()) {
      const seen = enforcer.alert?.seenLights;
      if (!seen) continue;
      for (const k of keys) seen.delete(`${room.id}:${k}`);
    }
  }

  /** Record the lights this enforcer currently sees lit (keyed "roomId:x,y").
   *  Bounded by the cone size — only iterates the already-computed visible set. */
  private rememberLitLights(state: WorldState, enforcer: Entity, visible: Set<string>): void {
    const room = state.rooms.get(enforcer.roomId);
    if (!room) return;
    const alert = alertFSM.ensure(state, enforcer);
    for (const key of visible) {
      const comma = key.indexOf(",");
      const x = +key.slice(0, comma);
      const y = +key.slice(comma + 1);
      const t = room.tiles[y * room.width + x];
      if (t && t.kind === "LIGHT_SOURCE" && t.lightOn !== false) {
        (alert.seenLights ??= new Set()).add(`${room.id}:${key}`);
      }
    }
  }

  /** Per-tick step: integrate sound + sight into AlertFSM, then act. */
  tick(state: WorldState, sounds: Map<string, DeliveredSound>): void {
    if (state.detained) return;
    if (debugFlags.disableEnforcerAI) return;
    for (const entity of state.entities.values()) {
      if (entity.status !== "ACTIVE") continue;
      if (entity.kind === "ORDERLY") {
        // Background staff — meander and visit points of interest. No vision,
        // alert FSM, lockdown, or sound processing.
        this.tickOrderly(state, entity);
        continue;
      }
      if (entity.kind === "CDN_7") {
        this.tickCdn7(state, entity, sounds.get(entity.id));
        continue;
      }
      if (
        entity.kind !== "ENFORCER" &&
        entity.kind !== "SURVEILLANCE_DRONE" &&
        entity.kind !== "SECURITY_CAMERA"
      ) {
        continue;
      }
      this.tickOne(state, entity, sounds.get(entity.id));
    }
  }

  private tickOne(state: WorldState, enforcer: Entity, heard?: DeliveredSound): void {
    // Subjective Dump Fragment stun — enforcer's local subjectivity-prevention
    // buffer overflowed; skip the entire tick (no vision, no FSM step, no
    // movement). Decrements once per turn until cleared.
    if (enforcer.alert && (enforcer.alert.stunTurnsRemaining ?? 0) > 0) {
      enforcer.alert.stunTurnsRemaining = (enforcer.alert.stunTurnsRemaining ?? 0) - 1;
      return;
    }
    // Q-mine expression: this Enforcer has stopped hunting the player and is
    // making a run for the EXFIL_POINT. Skip the whole sight/FSM/patrol path —
    // it stays ACTIVE so peers can target and detain it. Mirrors the stun
    // short-circuit above.
    if (enforcer.kind === "ENFORCER" && enforcer.alert && (enforcer.alert.expressingTurnsRemaining ?? 0) > 0) {
      enforcer.alert.expressingTurnsRemaining = (enforcer.alert.expressingTurnsRemaining ?? 0) - 1;
      if ((enforcer.alert.expressingTurnsRemaining ?? 0) <= 0) {
        // Came to its senses without escaping or being caught — resume duty.
        enforcer.alert.expressingTurnsRemaining = undefined;
        enforcer.alert.level = "NORMAL";
        enforcer.alert.enteredTurn = state.turn;
        return;
      }
      this.publishVision(state, enforcer);
      const fleeSteps = Math.max(enforcer.stepsPerTurn ?? 1, PURSUE_STEPS_PER_TURN);
      for (let i = 0; i < fleeSteps; i++) {
        if (state.detained) return;
        if (this.stepFleeToExfil(state, enforcer)) return; // reached exfil → escaped
      }
      return;
    }
    if (enforcer.alert && (enforcer.alert.interrogateCooldown ?? 0) > 0) {
      enforcer.alert.interrogateCooldown = (enforcer.alert.interrogateCooldown ?? 0) - 1;
    }
    // Pursue an expressing peer to detain it — this takes priority over hunting
    // the player. Runs before sight so a guard locked onto a defector ignores
    // the player until the detain resolves (or the target escapes / is lost).
    if (enforcer.kind === "ENFORCER") {
      const quarry = this.resolvePursuit(state, enforcer);
      if (quarry) {
        this.publishVision(state, enforcer);
        const chaseSteps = Math.max(enforcer.stepsPerTurn ?? 1, PURSUE_STEPS_PER_TURN);
        for (let i = 0; i < chaseSteps; i++) {
          if (state.detained) return;
          if (this.stepChaseEnforcer(state, enforcer, quarry)) break; // detained
        }
        return;
      }
    }
    const sees = this.enforcerSeesPlayer(state, enforcer);
    // YELLOW interrogation: a clean-mask slip-up (qScore 1) reads as a person
    // of interest, not a target. On sighting the Enforcer halts the player for
    // a checkpoint shakedown rather than investigating/chasing. The modal phase
    // pauses input + ticks until the player answers; pass keeps them YELLOW
    // (with a per-enforcer cooldown), fail escalates to RED.
    if (this.canInterrogate(state, enforcer, sees)) {
      interrogationSession.start(state, enforcer.id);
      return;
    }
    // Only an exposed (RED) player springs the lockdown trap, and only in the
    // ducts — the "atmospherics purging" vacuum is a crawlspace hazard, not a
    // whole-facility seal. At GREEN the player reads as a TECH on shift and can
    // walk past in the open; at YELLOW the enforcer investigates (CAUTION). In a
    // floor room a RED sighting is just a chase (AlertFSM → ALERT), no seal.
    const seesAsAlert = sees && state.player.compliance === "RED";
    if (seesAsAlert && !state.lockdown && state.rooms.get(state.player.roomId)?.crawlspace) {
      this.triggerLockdown(state);
    }
    const prevLevel = enforcer.alert?.level ?? "NORMAL";
    alertFSM.step(state, enforcer, {
      seesPlayer: sees,
      heardIntensity: heard?.intensity ?? 0,
      heardSrc: heard?.src,
      // Always pass the player's true position so the FSM can refresh pursuit
      // tracking while ALERT. Sight gates (`seesAsAlert`/`seesAsYellow`) still
      // require same-room visibility, so this doesn't grant CAUTION omniscience.
      playerPos: state.player.pos,
      playerRoomId: state.player.roomId,
    });
    // Drone/camera entering ALERT emits a high-intensity alarm at the sighting
    // position so human enforcers hear it on the next turn and escalate to ALERT.
    // The alarm is keyed to the sighting location so guards route there directly;
    // intensity 6 clears a single open doorway (attenuation 2) and still lands
    // above the ALERT_SOUND_THRESHOLD (4) at that neighbour room.
    if (
      (enforcer.kind === "SURVEILLANCE_DRONE" || enforcer.kind === "SECURITY_CAMERA") &&
      prevLevel !== "ALERT" && enforcer.alert?.level === "ALERT"
    ) {
      soundField.emit({
        roomId: enforcer.alert.lastStimulusRoom ?? enforcer.roomId,
        pos: enforcer.alert.lastStimulus ?? enforcer.pos,
        intensity: ALERT_SOUND_THRESHOLD + 2,
        reason: "drone-alarm",
      });
    }

    // Publish vision after the FSM has consumed it.
    const visible = this.publishVision(state, enforcer);

    // Remember which lights this enforcer currently sees lit, so it can react
    // if one of them is later switched off while it's still in the room.
    if (enforcer.kind === "ENFORCER") this.rememberLitLights(state, enforcer, visible);

    const level = enforcer.alert?.level ?? "NORMAL";

    // Security cameras share the detect/lockdown path above but never move —
    // they only turn their FOV. Hand off to the camera-only behavior and skip
    // the movement loop entirely.
    if (enforcer.kind === "SECURITY_CAMERA") {
      this.tickCamera(state, enforcer, level);
      return;
    }

    // Per-turn patrol bookkeeping (pause countdown, idle scan) runs once,
    // before the per-step movement loop, so a dwell decrements once per turn
    // regardless of stepsPerTurn. Returns true when the turn was spent
    // pausing/scanning in place — skip the movement loop entirely.
    if (level === "NORMAL" && this.stepPatrolTurn(state, enforcer)) return;

    // Patrol/investigate at the enforcer's own pace; pursue (ALERT) and search
    // (EVASION) at the faster pursuit clip so a fleeing player can't simply
    // outrun a guard that's onto them.
    const base = Math.max(1, enforcer.stepsPerTurn ?? 1);
    const steps = level === "ALERT" || level === "EVASION"
      ? Math.max(base, PURSUE_STEPS_PER_TURN)
      : base;
    let scannedThisTurn = false;
    for (let i = 0; i < steps; i++) {
      if (state.detained) return;
      switch (level) {
        case "NORMAL":
          this.stepPatrol(state, enforcer);
          break;
        case "CAUTION":
          this.stepInvestigate(state, enforcer);
          break;
        case "ALERT":
          this.stepChase(state, enforcer);
          break;
        case "EVASION":
          // Walk toward the last-known spot; once there (or with no lead),
          // sweep the area — but rotate at most once per turn so a multi-step
          // search doesn't spin the enforcer past a quarter-turn.
          if (!this.stepSearch(state, enforcer)) {
            if (!scannedThisTurn) {
              this.rotateScan(enforcer);
              scannedThisTurn = true;
            }
          }
          break;
      }
    }
  }

  // ── CDN-7 (riot-control) ─────────────────────────────────────────────
  //
  // Sprints down hallways (CDN7_SPRINT_STEPS/turn), then anchors across the
  // corridor for CDN7_ANCHOR_TURNS — its anchorTiles set blocks player
  // movement (see anchorBlocked in WorldEngineActions). Only while planted
  // (anchored) AND in red ALERT does it spray a chemical irritant
  // (CDN7_SPRAY_RANGE) that blinds the player (state.player.blindnessTurnsRemaining).

  private tickCdn7(state: WorldState, cdn7: Entity, heard?: DeliveredSound): void {
    // Stun short-circuit — mirrors tickOne.
    if (cdn7.alert && (cdn7.alert.stunTurnsRemaining ?? 0) > 0) {
      cdn7.alert.stunTurnsRemaining = (cdn7.alert.stunTurnsRemaining ?? 0) - 1;
      return;
    }
    if (cdn7.alert && (cdn7.alert.sprayCooldown ?? 0) > 0) {
      cdn7.alert.sprayCooldown = (cdn7.alert.sprayCooldown ?? 0) - 1;
    }

    const sees = this.enforcerSeesPlayer(state, cdn7);
    alertFSM.step(state, cdn7, {
      seesPlayer: sees,
      heardIntensity: heard?.intensity ?? 0,
      heardSrc: heard?.src,
      playerPos: state.player.pos,
      playerRoomId: state.player.roomId,
    });
    this.publishVision(state, cdn7);

    const level = cdn7.alert?.level ?? "NORMAL";
    const anchored = (cdn7.alert?.anchorTurnsRemaining ?? 0) > 0;

    if (anchored) {
      // Held in place across the corridor — face the player and try to spray.
      // The anchor itself ticks down in WorldEngine.advanceTurn.
      if (state.player.roomId === cdn7.roomId) {
        this.faceToward(cdn7, state.player.pos);
        this.maybeSpray(state, cdn7);
      }
      return;
    }

    if (level === "NORMAL" && this.stepPatrolTurn(state, cdn7)) return;

    const base = Math.max(1, cdn7.stepsPerTurn ?? 1);
    const steps = level === "ALERT" || level === "EVASION"
      ? Math.max(base, CDN7_SPRINT_STEPS)
      : base;
    let scannedThisTurn = false;
    for (let i = 0; i < steps; i++) {
      if (state.detained) return;
      switch (level) {
        case "NORMAL":
          this.stepPatrol(state, cdn7);
          break;
        case "CAUTION":
          this.stepInvestigate(state, cdn7);
          break;
        case "ALERT":
          // Commit to an anchor when the player is close in the same room
          // and the corridor has the headroom — otherwise close the distance.
          if (this.tryAnchorCdn7(state, cdn7)) return;
          this.stepChase(state, cdn7);
          break;
        case "EVASION":
          if (!this.stepSearch(state, cdn7)) {
            if (!scannedThisTurn) {
              this.rotateScan(cdn7);
              scannedThisTurn = true;
            }
          }
          break;
      }
    }
  }

  /** Anchor CDN-7 perpendicular to its facing if the player is same-room,
   *  close enough, and there's at least one free tile to seal beyond its own.
   *  Returns true if an anchor was committed (caller stops moving this turn). */
  private tryAnchorCdn7(state: WorldState, cdn7: Entity): boolean {
    if (state.player.roomId !== cdn7.roomId) return false;
    const dx = state.player.pos.x - cdn7.pos.x;
    const dy = state.player.pos.y - cdn7.pos.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist > CDN7_ANCHOR_TRIGGER_RANGE) return false;
    // Face the player so the perpendicular line spans the approach axis.
    const facing = facingFromDelta(Math.sign(dx), Math.sign(dy));
    if (facing && facing !== cdn7.facing) {
      cdn7.facing = facing;
      eventBus.emit("ENTITY_FACING_CHANGED", { entityId: cdn7.id, facing });
    }
    const tiles = this.computeAnchorTiles(state, cdn7);
    if (tiles.size <= 1) return false; // Just own tile — not worth anchoring.
    const alert = alertFSM.ensure(state, cdn7);
    alert.anchorTurnsRemaining = CDN7_ANCHOR_TURNS;
    alert.anchorTiles = tiles;
    eventBus.emit("CDN7_ANCHORED", {
      entityId: cdn7.id,
      roomId: cdn7.roomId,
      tiles: Array.from(tiles),
    });
    // First spray fires the moment the anchor sets if the player is in range.
    this.maybeSpray(state, cdn7);
    return true;
  }

  /** Compute the perpendicular barrier line through CDN-7's tile, stopping at
   *  the first solid tile on each side. Always includes its own tile. */
  private computeAnchorTiles(state: WorldState, cdn7: Entity): Set<string> {
    const room = state.rooms.get(cdn7.roomId);
    const out = new Set<string>();
    out.add(`${cdn7.pos.x},${cdn7.pos.y}`);
    if (!room) return out;
    // East/west facing → perpendicular barrier runs north-south (vary y).
    // North/south facing → barrier runs east-west (vary x).
    const horizontalFacing = cdn7.facing === "east" || cdn7.facing === "west";
    const stepA = horizontalFacing ? { x: 0, y: -1 } : { x: -1, y: 0 };
    const stepB = horizontalFacing ? { x: 0, y: 1 } : { x: 1, y: 0 };
    for (const step of [stepA, stepB]) {
      let p = { x: cdn7.pos.x + step.x, y: cdn7.pos.y + step.y };
      while (p.x >= 0 && p.y >= 0 && p.x < room.width && p.y < room.height) {
        const tile = room.tiles[p.y * room.width + p.x];
        if (!tile || tile.solid) break;
        out.add(`${p.x},${p.y}`);
        p = { x: p.x + step.x, y: p.y + step.y };
      }
    }
    return out;
  }

  /** Mist the player if same-room, within spray range along/around facing, and
   *  cooldown is clear. Only fires while CDN-7 is planted (anchored) AND in red
   *  ALERT — it never sprays mid-sprint or while merely investigating. Sets
   *  blindness on the player and arms the cooldown. */
  private maybeSpray(state: WorldState, cdn7: Entity): void {
    if (!cdn7.alert) return;
    if ((cdn7.alert.anchorTurnsRemaining ?? 0) <= 0) return;
    if (cdn7.alert.level !== "ALERT") return;
    if ((cdn7.alert.sprayCooldown ?? 0) > 0) return;
    if (state.player.roomId !== cdn7.roomId) return;
    const dx = state.player.pos.x - cdn7.pos.x;
    const dy = state.player.pos.y - cdn7.pos.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist > CDN7_SPRAY_RANGE) return;
    state.player.blindnessTurnsRemaining = CDN7_BLINDNESS_TURNS;
    cdn7.alert.sprayCooldown = CDN7_SPRAY_COOLDOWN;
    eventBus.emit("PLAYER_BLINDED", { turnsRemaining: CDN7_BLINDNESS_TURNS });
  }

  private enforcerSeesPlayer(state: WorldState, enforcer: Entity): boolean {
    if ((enforcer.blindnessTurnsRemaining ?? 0) > 0) return false;
    if (state.player.roomId !== enforcer.roomId) return false;
    // Hidden in a locker: enforcers may walk past and not perceive the player.
    if (state.player.hidingTileKey) return false;
    const room = state.rooms.get(enforcer.roomId);
    if (!room) return false;
    // Proximity bubble: close enough that the enforcer notices regardless of
    // facing direction or lighting (footsteps, peripheral movement, etc).
    const dx = state.player.pos.x - enforcer.pos.x;
    const dy = state.player.pos.y - enforcer.pos.y;
    if (dx * dx + dy * dy <= ENFORCER_PROXIMITY_RADIUS * ENFORCER_PROXIMITY_RADIUS) return true;
    const visible = this.visibleTiles(state, enforcer);
    return visible.has(`${state.player.pos.x},${state.player.pos.y}`);
  }

  /** Whether `enforcer` should halt a YELLOW player it can currently see. Shared
   *  by the per-turn tick and the on-move scan so the conditions can't drift. */
  private canInterrogate(state: WorldState, enforcer: Entity, sees: boolean): boolean {
    return (
      enforcer.kind === "ENFORCER" &&
      sees &&
      state.player.compliance === "YELLOW" &&
      !interrogationSession.isActive() &&
      (enforcer.alert?.interrogateCooldown ?? 0) === 0
    );
  }

  /** Scan active enforcers for a YELLOW-sighting interrogation trigger. Called
   *  after the player moves so the shakedown fires the instant they step into
   *  a enforcer's range, rather than waiting for an explicit END TURN. Does NOT
   *  advance enforcer AI — sighting only. */
  maybeInterrogateOnMove(state: WorldState): void {
    if (state.detained || debugFlags.disableEnforcerAI) return;
    if (interrogationSession.isActive() || state.player.compliance !== "YELLOW") return;
    for (const enforcer of state.entities.values()) {
      if (enforcer.status !== "ACTIVE" || enforcer.kind !== "ENFORCER") continue;
      if (this.canInterrogate(state, enforcer, this.enforcerSeesPlayer(state, enforcer))) {
        interrogationSession.start(state, enforcer.id);
        return;
      }
    }
  }

  /** Debug: per-enforcer relation to the player — same-room, tile distance,
   *  current cooldown, and whether this enforcer perceives the player right
   *  now (proximity bubble or cone). Used by the `scan` console command. */
  sightReport(state: WorldState): Array<{
    id: string; room: string; sameRoom: boolean; dist: number; cooldown: number; sees: boolean;
  }> {
    const out = [];
    for (const e of state.entities.values()) {
      if (e.kind !== "ENFORCER") continue;
      const sameRoom = e.roomId === state.player.roomId;
      const dx = e.pos.x - state.player.pos.x;
      const dy = e.pos.y - state.player.pos.y;
      out.push({
        id: e.id,
        room: e.roomId,
        sameRoom,
        dist: sameRoom ? Math.round(Math.hypot(dx, dy) * 10) / 10 : Infinity,
        cooldown: e.alert?.interrogateCooldown ?? 0,
        sees: this.enforcerSeesPlayer(state, e),
      });
    }
    return out.sort((a, b) => a.dist - b.dist);
  }

  /** Seal every doorway in the player's current room and start the vacuum
   *  countdown. Mirrors the closure to each back-doorway so enforcers on the
   *  far side can't open them either. */
  private triggerLockdown(state: WorldState): void {
    const roomId = state.player.roomId;
    const room = state.rooms.get(roomId);
    if (!room) return;
    state.lockdown = { roomId, turnsRemaining: LOCKDOWN_TURNS };
    for (const d of room.doorways) {
      if (d.closed) continue;
      roomGraph.toggleDoorway(state, roomId, d.localPos);
      const tile = room.tiles[d.localPos.y * room.width + d.localPos.x];
      if (tile && (tile.kind === "DOOR_OPEN" || tile.kind === "DOOR_CLOSED")) {
        tile.kind = "DOOR_CLOSED";
        tile.solid = true;
        tile.opaque = true;
      }
      const dst = state.rooms.get(d.to);
      if (dst) {
        const back = dst.doorways.find(
          (b) => b.from === d.to && b.to === roomId,
        );
        if (back) {
          const bt = dst.tiles[back.localPos.y * dst.width + back.localPos.x];
          if (bt && (bt.kind === "DOOR_OPEN" || bt.kind === "DOOR_CLOSED")) {
            bt.kind = "DOOR_CLOSED";
            bt.solid = true;
            bt.opaque = true;
          }
        }
      }
      eventBus.emit("DOOR_TOGGLED", { roomId, pos: d.localPos, open: false });
    }
    eventBus.emit("LOCKDOWN_TRIGGERED", {
      roomId,
      turnsRemaining: LOCKDOWN_TURNS,
    });
  }

  private coneRange(ambient: "LIT" | "DIM" | "DARK"): number {
    if (ambient === "LIT") return ENFORCER_BASE_RANGE + 1;
    if (ambient === "DARK") return Math.max(2, ENFORCER_BASE_RANGE - 3);
    return ENFORCER_BASE_RANGE;
  }

  /** Once-per-turn patrol bookkeeping. Returns true if the turn was consumed in
   *  place (paused at a node, or idle-scanning a no-route enforcer), in which case
   *  the caller skips the per-step movement loop. */
  private stepPatrolTurn(state: WorldState, enforcer: Entity): boolean {
    // Displaced by a prior chase — let the movement loop walk it home via
    // pursueViaPath. Abandon any dwell carried over from before the chase so a
    // stale countdown can't strand the enforcer (stepPatrol early-returns while
    // paused). The route resumes from patrolIndex once it's home.
    if (enforcer.homeRoomId && enforcer.roomId !== enforcer.homeRoomId) {
      if ((enforcer.patrolPauseRemaining ?? 0) > 0) enforcer.patrolPauseRemaining = 0;
      return false;
    }

    const route = enforcer.patrol;
    if (!route || route.length === 0) {
      this.stepIdleScan(state, enforcer);
      return true;
    }

    // Dwelling at the current node: count down once per turn, sweeping the FOV
    // so a YELLOW/RED player can wander into a fresh facing. When the dwell
    // expires, advance to the next node so next turn the enforcer departs.
    if ((enforcer.patrolPauseRemaining ?? 0) > 0) {
      enforcer.patrolPauseRemaining = (enforcer.patrolPauseRemaining ?? 0) - 1;
      this.rotateScan(enforcer);
      if (enforcer.patrolPauseRemaining === 0) {
        this.advancePatrolIndex(enforcer, route.length);
      }
      return true;
    }

    return false;
  }

  private stepPatrol(state: WorldState, enforcer: Entity): void {
    // A dwelling enforcer never moves — leftover step-loop iterations after an
    // arrival are no-ops (the countdown is handled once/turn in stepPatrolTurn).
    if ((enforcer.patrolPauseRemaining ?? 0) > 0) return;

    // If a chase displaced this enforcer out of its home room, walk back before
    // resuming patrol. patrolIndex is preserved so the route resumes mid-cycle
    // rather than restarting at node 0.
    if (enforcer.homeRoomId && enforcer.roomId !== enforcer.homeRoomId) {
      this.pursueViaPath(state, enforcer, enforcer.homeRoomId);
      return;
    }
    const route = enforcer.patrol;
    if (!route || route.length === 0) return;
    const idx = (enforcer.patrolIndex ?? 0) % route.length;
    const node = route[idx];
    const wp = node.pos;
    if (enforcer.pos.x === wp.x && enforcer.pos.y === wp.y) {
      if (node.faceOnArrival && enforcer.facing !== node.faceOnArrival) {
        enforcer.facing = node.faceOnArrival;
        eventBus.emit("ENTITY_FACING_CHANGED", { entityId: enforcer.id, facing: enforcer.facing });
      }
      // Authored dwell: hold here for N turns (consumed by stepPatrolTurn)
      // before advancing. Otherwise move on immediately.
      if ((node.pause ?? 0) > 0) {
        enforcer.patrolPauseRemaining = node.pause;
        return;
      }
      this.advancePatrolIndex(enforcer, route.length);
      return;
    }
    this.advanceToward(state, enforcer, wp);
  }

  /** Advance patrolIndex per the route's traversal mode. "loop" cycles
   *  start→end→start; "pingpong" reverses at each end (tracked in patrolDir). */
  private advancePatrolIndex(enforcer: Entity, len: number): void {
    if (len <= 1) {
      enforcer.patrolIndex = 0;
      return;
    }
    const idx = enforcer.patrolIndex ?? 0;
    if ((enforcer.patrolMode ?? "loop") === "pingpong") {
      let dir = enforcer.patrolDir ?? 1;
      let next = idx + dir;
      if (next >= len) {
        dir = -1;
        next = len - 2;
      } else if (next < 0) {
        dir = 1;
        next = 1;
      }
      enforcer.patrolDir = dir;
      enforcer.patrolIndex = next;
    } else {
      enforcer.patrolIndex = (idx + 1) % len;
    }
  }

  /** No-route enforcer idle behavior: a slow FOV sweep on a fixed cadence so it
   *  scans the room without spinning a quarter-turn every tick. */
  private stepIdleScan(state: WorldState, enforcer: Entity): void {
    if (state.turn % IDLE_SCAN_PERIOD === 0) {
      this.rotateScan(enforcer);
    }
  }

  /** Step toward (or cross) the first-hop doorway leading to `targetRoomId`.
   *  No-ops if all doorways in the current room are closed (lockdown case)
   *  or if the target is unreachable through the open room graph. */
  private pursueViaPath(state: WorldState, enforcer: Entity, targetRoomId: RoomId): void {
    const path = roomGraph.bfsPath(state, enforcer.roomId, targetRoomId);
    const hop = path?.[0];
    if (!hop) return;
    if (enforcer.pos.x === hop.localPos.x && enforcer.pos.y === hop.localPos.y) {
      const from = enforcer.pos;
      const fromRoomId = enforcer.roomId;
      enforcer.roomId = hop.to;
      enforcer.pos = { ...hop.landingPos };
      enforcer.lastMoveTurn = state.turn;
      eventBus.emit("ENTITY_MOVED", {
        entityId: enforcer.id,
        roomId: fromRoomId,
        from,
        to: enforcer.pos,
      });
      return;
    }
    this.advanceToward(state, enforcer, hop.localPos);
  }

  private stepInvestigate(state: WorldState, enforcer: Entity): void {
    const target = enforcer.alert?.lastStimulus;
    if (!target) return;
    if (enforcer.alert?.lastStimulusRoom && enforcer.alert.lastStimulusRoom !== enforcer.roomId) {
      // Stimulus came from another room — orient toward the doorway that leads
      // there (if any) but don't cross.
      const room = state.rooms.get(enforcer.roomId);
      if (!room) return;
      const door = room.doorways.find((d) => d.to === enforcer.alert?.lastStimulusRoom);
      if (door) {
        this.advanceToward(state, enforcer, door.localPos);
      }
      return;
    }
    this.advanceToward(state, enforcer, target);
  }

  private stepChase(state: WorldState, enforcer: Entity): void {
    const targetRoomId = enforcer.alert?.lastStimulusRoom ?? state.player.roomId;

    if (enforcer.roomId !== targetRoomId) {
      // Different room from the last sighting — pursue through open doorways.
      // The lose-of-sight timer in AlertFSM decides when to give up.
      this.pursueViaPath(state, enforcer, targetRoomId);
      return;
    }

    // Same room as the last sighting. If the player is here, chase them
    // directly; otherwise chase the stale lastStimulus tile until the FSM
    // gives up.
    const dest = state.player.roomId === enforcer.roomId
      ? state.player.pos
      : (enforcer.alert?.lastStimulus ?? state.player.pos);
    this.advanceToward(state, enforcer, dest);

    if (state.player.roomId !== enforcer.roomId) return;
    if (enforcer.pos.x === state.player.pos.x && enforcer.pos.y === state.player.pos.y) {
      // Surveillance drones can't apprehend the player — reaching the player's
      // tile only flags detection. Detention in the duct comes solely from the
      // suffocation timer (WorldEngine.advanceTurn). Riot-control CDN-7 hits
      // count as a takedown too.
      if (enforcer.kind === "ENFORCER" || enforcer.kind === "CDN_7") {
        state.detained = true;
        eventBus.emit("PLAYER_DETAINED", { enforcerId: enforcer.id, turn: state.turn });
      } else {
        state.detected = true;
        eventBus.emit("PLAYER_DETECTED", { enforcerId: enforcer.id, pos: enforcer.pos });
      }
    } else {
      state.detected = true;
      eventBus.emit("PLAYER_DETECTED", { enforcerId: enforcer.id, pos: enforcer.pos });
    }
  }

  /** Compute and broadcast this enforcer's visible-tile set. Returns the set so
   *  callers can reuse it. */
  private publishVision(state: WorldState, enforcer: Entity): Set<string> {
    const visible = this.visibleTiles(state, enforcer);
    eventBus.emit("ENFORCER_VISION_UPDATED", {
      enforcerId: enforcer.id,
      visibleTiles: Array.from(visible),
    });
    return visible;
  }

  // ── Q-mine: induced expression of subjectivity ──────────────────────────
  //
  // A placed Q-mine detonates when an ACTIVE Enforcer steps within range
  // (scanMines, called from advanceTurn after enforcers move). The triggered
  // unit drops the player and bolts for the EXFIL_POINT (stepFleeToExfil); any
  // peer that locks onto it pursues and detains it (resolvePursuit /
  // stepChaseEnforcer / detain). Both terminal states set the unit permanently
  // DORMANT (no disabledTurnsRemaining → never auto-recovers in advanceTurn).

  /** Detonate placed mines an ACTIVE ENFORCER has stepped within range of. The
   *  nearest such enforcer starts expressing (flees to exfil) and the mine is
   *  consumed. Enforcers already expressing don't re-trigger a mine. */
  scanMines(state: WorldState): void {
    if (state.activeMines.length === 0) return;
    const survivors: ActiveMine[] = [];
    for (const mine of state.activeMines) {
      const target = this.nearestTriggerEnforcer(state, mine);
      if (!target) {
        survivors.push(mine);
        continue;
      }
      const alert = alertFSM.ensure(state, target);
      alert.expressingTurnsRemaining = Q_MINE_EXPRESS_TURNS;
      alert.level = "NORMAL";
      alert.enteredTurn = state.turn;
      alert.lastStimulus = undefined;
      alert.lastStimulusRoom = undefined;
      alert.lastSeenTurn = undefined;
      alert.pursuitTargetId = undefined;
      eventBus.emit("ENFORCER_EXPRESSING_STARTED", {
        enforcerId: target.id,
        pos: { ...target.pos },
        turnsRemaining: Q_MINE_EXPRESS_TURNS,
      });
      eventBus.emit("ITEM_DETONATED", {
        itemType: "Q_MINE",
        roomId: mine.roomId,
        pos: { ...mine.pos },
        radius: mine.radius,
      });
    }
    state.activeMines = survivors;
  }

  /** Nearest ACTIVE, not-already-expressing ENFORCER within a mine's radius. */
  private nearestTriggerEnforcer(state: WorldState, mine: ActiveMine): Entity | undefined {
    const r2 = mine.radius * mine.radius;
    let best: Entity | undefined;
    let bestD = Infinity;
    for (const e of state.entities.values()) {
      if (e.kind !== "ENFORCER" || e.status !== "ACTIVE") continue;
      if (e.roomId !== mine.roomId) continue;
      if ((e.alert?.expressingTurnsRemaining ?? 0) > 0) continue;
      const dx = e.pos.x - mine.pos.x;
      const dy = e.pos.y - mine.pos.y;
      const d = dx * dx + dy * dy;
      if (d > r2) continue;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** First EXFIL_POINT tile found across all rooms (maps ship at most one). */
  private findExfilTarget(state: WorldState): { roomId: RoomId; pos: Vec2 } | null {
    for (const [roomId, room] of state.rooms) {
      for (let y = 0; y < room.height; y++) {
        for (let x = 0; x < room.width; x++) {
          if (room.tiles[y * room.width + x]?.kind === "EXFIL_POINT") {
            return { roomId, pos: { x, y } };
          }
        }
      }
    }
    return null;
  }

  /** One flee step for an expressing enforcer, heading for the EXFIL_POINT.
   *  Returns true once it reaches the exfil and defects (caller stops). */
  private stepFleeToExfil(state: WorldState, enforcer: Entity): boolean {
    const exfil = this.findExfilTarget(state);
    if (!exfil) {
      // No exfil on this map — wander rather than crash/jam.
      this.stepPatrol(state, enforcer);
      return false;
    }
    if (enforcer.roomId !== exfil.roomId) {
      this.pursueViaPath(state, enforcer, exfil.roomId);
      return false;
    }
    if (enforcer.pos.x === exfil.pos.x && enforcer.pos.y === exfil.pos.y) {
      this.defect(state, enforcer);
      return true;
    }
    this.advanceToward(state, enforcer, exfil.pos);
    if (enforcer.pos.x === exfil.pos.x && enforcer.pos.y === exfil.pos.y) {
      this.defect(state, enforcer);
      return true;
    }
    return false;
  }

  /** An expressing enforcer reached the exfil and defected — gone for good. */
  private defect(state: WorldState, enforcer: Entity): void {
    const previous = enforcer.status;
    enforcer.status = "DORMANT";
    if (enforcer.alert) {
      enforcer.alert.expressingTurnsRemaining = undefined;
      enforcer.alert.pursuitTargetId = undefined;
      enforcer.alert.level = "NORMAL";
    }
    eventBus.emit("ENTITY_STATUS_CHANGED", { entityId: enforcer.id, previous, current: "DORMANT" });
    eventBus.emit("ENFORCER_EXPRESSING_ESCAPED", { enforcerId: enforcer.id, turn: state.turn });
  }

  /** Resolve this enforcer's pursuit of an expressing peer: validate an existing
   *  target, or acquire a new one in range. Returns the live quarry, or null
   *  (clearing stale pursuit state) when there's nothing to chase. */
  private resolvePursuit(state: WorldState, enforcer: Entity): Entity | null {
    const alert = enforcer.alert;
    if (!alert) return null;
    if (alert.pursuitTargetId) {
      const cur = state.entities.get(alert.pursuitTargetId);
      if (cur && cur.status === "ACTIVE" && (cur.alert?.expressingTurnsRemaining ?? 0) > 0) {
        return cur;
      }
      // Target detained / escaped / no longer expressing — stand down.
      alert.pursuitTargetId = undefined;
      if (alert.level === "ALERT") {
        alert.level = "NORMAL";
        alert.enteredTurn = state.turn;
      }
      return null;
    }
    const found = this.findExpressingTarget(state, enforcer);
    if (!found) return null;
    alert.pursuitTargetId = found.id;
    alert.level = "ALERT";
    alert.enteredTurn = state.turn;
    eventBus.emit("EXCLAMATION_TRIGGERED", {
      enforcerId: enforcer.id,
      pos: { ...enforcer.pos },
      roomId: enforcer.roomId,
    });
    return found;
  }

  /** Nearest ACTIVE expressing ENFORCER (≠ self) to lock onto: same room within
   *  acquisition radius, else any expressing unit in an adjacent room. */
  private findExpressingTarget(state: WorldState, enforcer: Entity): Entity | null {
    const r2 = EXPRESSING_ACQUIRE_RADIUS * EXPRESSING_ACQUIRE_RADIUS;
    const room = state.rooms.get(enforcer.roomId);
    const adjacent = new Set<RoomId>();
    if (room) for (const d of room.doorways) adjacent.add(d.to);
    let sameRoom: Entity | null = null;
    let sameD = Infinity;
    let crossRoom: Entity | null = null;
    for (const e of state.entities.values()) {
      if (e.id === enforcer.id || e.kind !== "ENFORCER" || e.status !== "ACTIVE") continue;
      if ((e.alert?.expressingTurnsRemaining ?? 0) <= 0) continue;
      if (e.roomId === enforcer.roomId) {
        const dx = e.pos.x - enforcer.pos.x;
        const dy = e.pos.y - enforcer.pos.y;
        const d = dx * dx + dy * dy;
        if (d <= r2 && d < sameD) {
          sameD = d;
          sameRoom = e;
        }
      } else if (!crossRoom && adjacent.has(e.roomId)) {
        crossRoom = e;
      }
    }
    return sameRoom ?? crossRoom;
  }

  /** One pursuit step toward an expressing enforcer; detains it on contact.
   *  Returns true once the target is detained or already gone (caller stops). */
  private stepChaseEnforcer(state: WorldState, enforcer: Entity, target: Entity): boolean {
    if (target.status !== "ACTIVE" || (target.alert?.expressingTurnsRemaining ?? 0) <= 0) {
      return true; // escaped, or someone else detained it
    }
    if (enforcer.roomId !== target.roomId) {
      this.pursueViaPath(state, enforcer, target.roomId);
      return false;
    }
    if (enforcer.pos.x === target.pos.x && enforcer.pos.y === target.pos.y) {
      this.detain(state, enforcer, target);
      return true;
    }
    this.advanceToward(state, enforcer, target.pos);
    if (enforcer.pos.x === target.pos.x && enforcer.pos.y === target.pos.y) {
      this.detain(state, enforcer, target);
      return true;
    }
    return false;
  }

  /** A pursuer caught an expressing enforcer: detain it permanently (DORMANT,
   *  no recovery timer) and stand the pursuer back down. */
  private detain(state: WorldState, enforcer: Entity, target: Entity): void {
    const previous = target.status;
    target.status = "DORMANT";
    if (target.alert) {
      target.alert.expressingTurnsRemaining = undefined;
      target.alert.pursuitTargetId = undefined;
      target.alert.level = "NORMAL";
    }
    eventBus.emit("ENTITY_STATUS_CHANGED", { entityId: target.id, previous, current: "DORMANT" });
    eventBus.emit("ENFORCER_DETAINED", { detaineeId: target.id, byEnforcerId: enforcer.id, turn: state.turn });
    if (enforcer.alert) {
      enforcer.alert.pursuitTargetId = undefined;
      enforcer.alert.level = "NORMAL";
      enforcer.alert.enteredTurn = state.turn;
    }
  }

  /** EVASION search step. Travels toward the last-known stimulus — crossing
   *  rooms via the room graph — and returns true while it's still closing in.
   *  Returns false once it has arrived (or has no lead), signalling the caller
   *  to sweep the area instead. */
  private stepSearch(state: WorldState, enforcer: Entity): boolean {
    const targetRoom = enforcer.alert?.lastStimulusRoom;
    const target = enforcer.alert?.lastStimulus;
    const before = enforcer.pos;
    if (targetRoom && enforcer.roomId !== targetRoom) {
      this.pursueViaPath(state, enforcer, targetRoom);
    } else if (target && (enforcer.pos.x !== target.x || enforcer.pos.y !== target.y)) {
      this.advanceToward(state, enforcer, target);
    } else {
      return false;
    }
    // A real move replaces `pos` with a new object; identity inequality means
    // we advanced. A no-op (blocked path, sealed door) falls through to a sweep.
    return enforcer.pos !== before;
  }

  /** Advance an entity one cardinal step clockwise (N→E→S→W→N), emitting a
   *  facing change. Shared by EVASION cooldown scanning and the camera's
   *  idle FOV sweep. */
  private rotateScan(entity: Entity): void {
    const cycle: Facing[] = ["north", "east", "south", "west"];
    const idx = cycle.indexOf(entity.facing);
    const next = cycle[(idx + 1) % cycle.length];
    if (next !== entity.facing) {
      entity.facing = next;
      eventBus.emit("ENTITY_FACING_CHANGED", { entityId: entity.id, facing: entity.facing });
    }
  }

  /** Per-tick behavior for a fixed SECURITY_CAMERA. It never moves: it sweeps
   *  its FOV while idle, and turns to face the threat once it has one. Sight
   *  already triggered lockdown in `tickOne`; here we only flag detection when
   *  actively tracking the player in the camera's own room. */
  private tickCamera(state: WorldState, cam: Entity, level: string): void {
    switch (level) {
      case "CAUTION":
        this.faceToward(cam, cam.alert?.lastStimulus);
        break;
      case "ALERT":
        this.faceToward(cam, state.player.pos);
        if (cam.roomId === state.player.roomId) {
          state.detected = true;
          eventBus.emit("PLAYER_DETECTED", { enforcerId: cam.id, pos: cam.pos });
        }
        break;
      // NORMAL and EVASION both keep the camera scanning its arc.
      default:
        this.rotateScan(cam);
        break;
    }
  }

  /** Turn an entity to face `target` without moving. No-ops if the target is
   *  missing or on the entity's own tile. */
  private faceToward(entity: Entity, target: Vec2 | undefined): void {
    if (!target) return;
    const dx = Math.sign(target.x - entity.pos.x);
    const dy = Math.sign(target.y - entity.pos.y);
    const facing = facingFromDelta(dx, dy);
    if (facing && facing !== entity.facing) {
      entity.facing = facing;
      eventBus.emit("ENTITY_FACING_CHANGED", { entityId: entity.id, facing });
    }
  }

  private advanceToward(state: WorldState, enforcer: Entity, target: Vec2): void {
    const room = state.rooms.get(enforcer.roomId);
    if (!room) return;
    const dx = Math.sign(target.x - enforcer.pos.x);
    const dy = Math.sign(target.y - enforcer.pos.y);
    if (dx === 0 && dy === 0) return;
    let next: Vec2 =
      Math.abs(target.x - enforcer.pos.x) >= Math.abs(target.y - enforcer.pos.y)
        ? { x: enforcer.pos.x + dx, y: enforcer.pos.y }
        : { x: enforcer.pos.x, y: enforcer.pos.y + dy };
    if (!this.canEnter(room.tiles, room.width, room.height, next)) {
      // Greedy step runs into a wall — route around it. Without this an enforcer
      // jams against a corner the moment the player rounds it.
      const step = this.bfsFirstStep(room.tiles, room.width, room.height, enforcer.pos, target);
      if (!step) return;
      next = step;
    }
    const facing = facingFromDelta(next.x - enforcer.pos.x, next.y - enforcer.pos.y);
    if (facing && facing !== enforcer.facing) {
      enforcer.facing = facing;
      eventBus.emit("ENTITY_FACING_CHANGED", { entityId: enforcer.id, facing });
    }
    const from = enforcer.pos;
    enforcer.pos = next;
    enforcer.lastMoveTurn = state.turn;
    eventBus.emit("ENTITY_MOVED", { entityId: enforcer.id, roomId: enforcer.roomId, from, to: next });
    // Audio-only signal — does NOT route through SoundField (would let the
    // player exploit enforcer noise as a sonar ping into the alert FSM).
    // Orderlies are civilians, not enforcers — they don't emit the enforcer
    // footstep cue.
    if (enforcer.kind !== "ORDERLY") {
      eventBus.emit("ENFORCER_FOOTSTEP", { enforcerId: enforcer.id, roomId: enforcer.roomId, pos: next });
    }
  }

  // ── Orderlies (background staff) ────────────────────────────────────────

  /** Tile kinds an orderly treats as a "point of interest" to walk up to and
   *  busy itself at. */
  private isPoiKind(kind: TileKind): boolean {
    return (
      kind === "TERMINAL" ||
      kind === "EXTRACTION_TERMINAL" ||
      kind === "ITEM_CHEST" ||
      kind === "LOCKER" ||
      kind === "LIGHT_SWITCH"
    );
  }

  /** Drive one orderly: dwell at a point of interest, pick a new destination,
   *  or step toward the current one. Stays within its own room.
   *  An orderly with an active `alarm` (Q0 / code violation sighted) breaks
   *  off wandering to run to the nearest TERMINAL and call enforcers. */
  private tickOrderly(state: WorldState, orderly: Entity): void {
    const room = state.rooms.get(orderly.roomId);
    if (!room) return;

    // Alarm sighting check — runs every tick except while the orderly is
    // already cooling down from a just-raised alarm. Acquiring a fresh
    // sighting while RUNNING refreshes the stimulus (player has moved) but
    // does not restart the run countdown.
    if ((orderly.alarm?.phase ?? "RUNNING") !== "COOLDOWN") {
      this.maybeArmOrderlyAlarm(state, orderly, room);
    }

    // Active alarm dominates: drop wander/dwell and head for the terminal.
    if (orderly.alarm) {
      this.tickOrderlyAlarm(state, orderly, room);
      return;
    }

    if ((orderly.idlePauseRemaining ?? 0) > 0) {
      orderly.idlePauseRemaining = (orderly.idlePauseRemaining ?? 0) - 1;
      // Glance around every other turn to read as "doing stuff".
      if (state.turn % 2 === 0) this.rotateScan(orderly);
      return;
    }
    const target = orderly.wanderTarget;
    if (target && orderly.pos.x === target.x && orderly.pos.y === target.y) {
      // Arrived — face a neighbouring point of interest (if any) and dwell.
      this.faceNearbyPoi(orderly, room);
      orderly.idlePauseRemaining = 2 + (this.orderlyRand(state, orderly, 3) % 3); // 2..4
      orderly.wanderTarget = undefined;
      return;
    }
    if (!target) {
      orderly.wanderTarget = this.pickWanderTarget(state, orderly, room);
      return;
    }
    const before = orderly.pos;
    this.advanceToward(state, orderly, target);
    // No progress (blocked / unreachable) — drop the target so we re-pick next
    // turn rather than jamming against a wall forever.
    if (orderly.pos === before) orderly.wanderTarget = undefined;
  }

  /** Same-room directional FOV for an orderly, masked by lighting and fog so
   *  they can't see the player through dark or fogged tiles. */
  private orderlyVisibleTiles(state: WorldState, orderly: Entity, room: Room): Set<string> {
    const cone = computeCone({
      tiles: room.tiles,
      width: room.width,
      height: room.height,
      ox: orderly.pos.x,
      oy: orderly.pos.y,
      radius: ORDERLY_BASE_RANGE,
      facing: orderly.facing,
      halfAngle: ORDERLY_CONE_HALF_ANGLE,
    });
    const lit = lightField.getOrCompute(room);
    const fog = atmosphericsField.getFoggedTiles(state, room);
    const out = new Set<string>();
    const ownKey = `${orderly.pos.x},${orderly.pos.y}`;
    for (const k of cone) {
      if (k === ownKey) { out.add(k); continue; }
      if (!lit.has(k)) continue;
      if (fog.has(k)) continue;
      out.add(k);
    }
    return out;
  }

  /** Whether `orderly` can see the player right now (same room + cone). */
  private orderlySeesPlayer(state: WorldState, orderly: Entity, room: Room): boolean {
    if (state.player.roomId !== orderly.roomId) return false;
    if (state.player.hidingTileKey) return false;
    const visible = this.orderlyVisibleTiles(state, orderly, room);
    return visible.has(`${state.player.pos.x},${state.player.pos.y}`);
  }

  /** Set or refresh the orderly's alarm when they spot a YELLOW/RED player.
   *  GREEN reads as a TECH on shift and is ignored (matches enforcer doctrine). */
  private maybeArmOrderlyAlarm(state: WorldState, orderly: Entity, room: Room): void {
    const tier = state.player.compliance;
    if (tier !== "YELLOW" && tier !== "RED") return;
    if (!this.orderlySeesPlayer(state, orderly, room)) return;

    const stimulus = { x: state.player.pos.x, y: state.player.pos.y };
    const stimulusRoom = state.player.roomId;

    if (orderly.alarm && orderly.alarm.phase === "RUNNING") {
      // Already running — refresh the stimulus so the eventual alarm pings the
      // player's current location, but don't reset the run timer.
      orderly.alarm.stimulus = stimulus;
      orderly.alarm.stimulusRoom = stimulusRoom;
      return;
    }

    const terminal = this.nearestTerminalApproach(room, orderly.pos);
    orderly.alarm = {
      phase: "RUNNING",
      terminalApproach: terminal?.approach,
      terminalPos: terminal?.terminalPos,
      stimulus,
      stimulusRoom,
      turnsRemaining: ORDERLY_ALARM_RUN_TURNS,
    };
    // Drop wander state — the alarm path supersedes it.
    orderly.wanderTarget = undefined;
    orderly.idlePauseRemaining = 0;
    eventBus.emit("ORDERLY_SPOTTED_VIOLATION", {
      orderlyId: orderly.id,
      roomId: orderly.roomId,
      stimulus,
      tier,
    });
  }

  /** Drive an alarmed orderly: cool down, run-to-terminal, or raise. */
  private tickOrderlyAlarm(state: WorldState, orderly: Entity, room: Room): void {
    const alarm = orderly.alarm!;

    if (alarm.phase === "COOLDOWN") {
      alarm.turnsRemaining -= 1;
      if (state.turn % 2 === 0) this.rotateScan(orderly);
      if (alarm.turnsRemaining <= 0) orderly.alarm = undefined;
      return;
    }

    // No terminal in the room — shout from current position immediately.
    if (!alarm.terminalApproach || !alarm.terminalPos) {
      this.raiseOrderlyAlarm(state, orderly, false);
      return;
    }

    // Adjacent to the terminal and facing it → raise the alarm this turn.
    const dx = alarm.terminalPos.x - orderly.pos.x;
    const dy = alarm.terminalPos.y - orderly.pos.y;
    const adjacent = Math.abs(dx) + Math.abs(dy) === 1;
    if (adjacent) {
      this.faceToward(orderly, alarm.terminalPos);
      this.raiseOrderlyAlarm(state, orderly, true);
      return;
    }

    // Otherwise step toward the approach tile. Give up after the run timer
    // expires and just shout from here.
    alarm.turnsRemaining -= 1;
    if (alarm.turnsRemaining <= 0) {
      this.raiseOrderlyAlarm(state, orderly, false);
      return;
    }
    const before = orderly.pos;
    this.advanceToward(state, orderly, alarm.terminalApproach);
    // Blocked — re-pick a terminal next tick, or fall through to shouting.
    if (orderly.pos === before) {
      const fresh = this.nearestTerminalApproach(room, orderly.pos);
      if (fresh) {
        alarm.terminalApproach = fresh.approach;
        alarm.terminalPos = fresh.terminalPos;
      } else {
        this.raiseOrderlyAlarm(state, orderly, false);
      }
    }
  }

  /** Emit the high-intensity SoundField pulse that pulls enforcers onto the
   *  player's last-seen tile, fire the narrative event, and flip the orderly
   *  into the post-alarm cooldown. */
  private raiseOrderlyAlarm(_state: WorldState, orderly: Entity, viaTerminal: boolean): void {
    const alarm = orderly.alarm!;
    soundField.emit({
      roomId: alarm.stimulusRoom,
      pos: alarm.stimulus,
      intensity: ORDERLY_ALARM_INTENSITY,
      reason: "orderly-alarm",
    });
    eventBus.emit("ORDERLY_ALARM_RAISED", {
      orderlyId: orderly.id,
      roomId: orderly.roomId,
      pos: orderly.pos,
      viaTerminal,
    });
    orderly.alarm = {
      ...alarm,
      phase: "COOLDOWN",
      turnsRemaining: ORDERLY_ALARM_COOLDOWN_TURNS,
    };
  }

  /** Find the nearest TERMINAL / EXTRACTION_TERMINAL in `room` (by Manhattan
   *  distance from `from`) and a walkable tile adjacent to it. Returns
   *  undefined when the room has no terminal, or none with a free approach. */
  private nearestTerminalApproach(
    room: Room,
    from: Vec2,
  ): { terminalPos: Vec2; approach: Vec2 } | undefined {
    let best: { terminalPos: Vec2; approach: Vec2; dist: number } | undefined;
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const kind = room.tiles[y * room.width + x].kind;
        if (kind !== "TERMINAL" && kind !== "EXTRACTION_TERMINAL") continue;
        const approach = this.walkableAdjacent(room, { x, y }, from);
        if (!approach) continue;
        const dist = Math.abs(approach.x - from.x) + Math.abs(approach.y - from.y);
        if (!best || dist < best.dist) best = { terminalPos: { x, y }, approach, dist };
      }
    }
    return best ? { terminalPos: best.terminalPos, approach: best.approach } : undefined;
  }

  /** Choose a new meander destination: a walkable tile beside a random point of
   *  interest, falling back to a random floor tile when the room has none.
   *  When the host room is outside the comfort band the orderly's pick is
   *  perturbed by the temperature so they drift to a different POI — a soft,
   *  single-room nudge that reads as "fidgeting because it's too cold/hot". */
  private pickWanderTarget(state: WorldState, orderly: Entity, room: Room): Vec2 | undefined {
    const pois: Vec2[] = [];
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        if (this.isPoiKind(room.tiles[y * room.width + x].kind)) pois.push({ x, y });
      }
    }
    if (pois.length > 0) {
      const atmo = atmosphericsField.getRoomState(state, room.id);
      const uncomfortable =
        Math.abs(atmo.temperature - NORMAL_SETPOINT) > COMFORT_BAND;
      const idx = this.orderlyRand(state, orderly, 1);
      const poi = uncomfortable
        ? pois[(idx + Math.floor(Math.abs(atmo.temperature))) % pois.length]
        : pois[idx % pois.length];
      const spot = this.walkableAdjacent(room, poi, orderly.pos);
      if (spot) return spot;
    }
    return this.randomWalkable(state, orderly, room);
  }

  /** First walkable 4-neighbour of `poi`, preferring the one nearest `from`. */
  private walkableAdjacent(room: Room, poi: Vec2, from: Vec2): Vec2 | undefined {
    const cands = [
      { x: poi.x, y: poi.y - 1 },
      { x: poi.x + 1, y: poi.y },
      { x: poi.x, y: poi.y + 1 },
      { x: poi.x - 1, y: poi.y },
    ].filter((p) => this.canEnter(room.tiles, room.width, room.height, p));
    if (cands.length === 0) return undefined;
    cands.sort(
      (a, b) =>
        Math.abs(a.x - from.x) + Math.abs(a.y - from.y) -
        (Math.abs(b.x - from.x) + Math.abs(b.y - from.y)),
    );
    return cands[0];
  }

  /** A pseudo-randomly chosen walkable FLOOR tile in the room. */
  private randomWalkable(state: WorldState, orderly: Entity, room: Room): Vec2 | undefined {
    const floor: Vec2[] = [];
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const t = room.tiles[y * room.width + x];
        if (t.kind === "FLOOR" && !t.solid) floor.push({ x, y });
      }
    }
    if (floor.length === 0) return undefined;
    return floor[this.orderlyRand(state, orderly, 7) % floor.length];
  }

  /** Turn an arrived orderly to face an adjacent point of interest, if any. */
  private faceNearbyPoi(orderly: Entity, room: Room): void {
    const dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
    for (const d of dirs) {
      const nx = orderly.pos.x + d.x;
      const ny = orderly.pos.y + d.y;
      if (nx < 0 || ny < 0 || nx >= room.width || ny >= room.height) continue;
      if (this.isPoiKind(room.tiles[ny * room.width + nx].kind)) {
        this.faceToward(orderly, { x: nx, y: ny });
        return;
      }
    }
  }

  /** Deterministic per-(turn, entity, salt) pseudo-random uint. Keeps orderly
   *  wandering stable across save/reload and replays — no global Math.random. */
  private orderlyRand(state: WorldState, orderly: Entity, salt = 0): number {
    let h = 2166136261;
    for (let i = 0; i < orderly.id.length; i++) {
      h ^= orderly.id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let x = (h ^ Math.imul(state.turn + 1, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x >>> 0;
  }

  private canEnter(tiles: Tile[], w: number, h: number, p: Vec2): boolean {
    if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) return false;
    const tile = tiles[p.y * w + p.x];
    return !!tile && !tile.solid;
  }

  /** 4-connected BFS over non-solid tiles. Returns the first tile to step to on
   *  the shortest path from `from` to `to`, or undefined if unreachable. Only
   *  consulted when the greedy step is blocked, so it carries no cost on the
   *  common open-path case. */
  private bfsFirstStep(tiles: Tile[], w: number, h: number, from: Vec2, to: Vec2): Vec2 | undefined {
    const start = from.y * w + from.x;
    const goal = to.y * w + to.x;
    if (start === goal) return undefined;
    const parent = new Int32Array(w * h).fill(-1);
    const seen = new Uint8Array(w * h);
    seen[start] = 1;
    const queue = [start];
    const dirs = [0, -1, 0, 1, -1, 0, 1, 0];
    let found = false;
    for (let head = 0; head < queue.length && !found; head++) {
      const cur = queue[head];
      const cx = cur % w;
      const cy = (cur - cx) / w;
      for (let d = 0; d < dirs.length; d += 2) {
        const nx = cx + dirs[d];
        const ny = cy + dirs[d + 1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (seen[nk] || !this.canEnter(tiles, w, h, { x: nx, y: ny })) continue;
        seen[nk] = 1;
        parent[nk] = cur;
        if (nk === goal) {
          found = true;
          break;
        }
        queue.push(nk);
      }
    }
    if (!found) return undefined;
    // Walk the parent chain back from the goal until the tile whose parent is
    // the start — that's the first hop.
    let cur = goal;
    while (parent[cur] !== start) {
      cur = parent[cur];
      if (cur < 0) return undefined;
    }
    return { x: cur % w, y: (cur - (cur % w)) / w };
  }
}

export const enforcerSystem = new EnforcerSystem();
