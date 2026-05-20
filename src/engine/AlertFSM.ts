// AlertFSM — per-guard alert state machine.
//
//   NORMAL   — patrol. Sound or peripheral sighting → CAUTION.
//   CAUTION  — orient + investigate. Confirmed sighting → ALERT (! marker).
//              Decay timer → NORMAL when no input for CAUTION_DECAY ticks.
//   ALERT    — active chase. Player out of LoS → EVASION.
//   EVASION  — cooldown / scan. Timer → NORMAL.

import type { AlertState, Entity, RoomId, Vec2, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";

export type AlertLevel = AlertState["level"];

export const CAUTION_DECAY = 4;
export const EVASION_TIMEOUT = 6;
/** Turns since the last confirmed sighting before an ALERT guard demotes
 *  to EVASION. Loose enough that the spotter keeps pursuing through one
 *  or two rooms before giving up. */
export const ALERT_LOSE_SIGHT_TURNS = 4;
/** Sound intensity that pulls a NORMAL guard into CAUTION. */
export const CAUTION_SOUND_THRESHOLD = 1;
/** Sound intensity that escalates a CAUTION guard to ALERT (very loud — knock,
 *  alignment-light spill, etc.). */
export const ALERT_SOUND_THRESHOLD = 4;

export interface StimulusInput {
  /** Guard sees the player THIS tick. */
  seesPlayer: boolean;
  /** Heard intensity (delivered by SoundField). 0 if no sound. */
  heardIntensity: number;
  heardSrc?: { roomId: RoomId; pos: Vec2 };
  playerPos?: Vec2;
  playerRoomId?: RoomId;
}

class AlertFSM {
  ensure(state: WorldState, guard: Entity): AlertState {
    if (!guard.alert) {
      guard.alert = { level: "NORMAL", enteredTurn: state.turn };
    }
    return guard.alert;
  }

  step(state: WorldState, guard: Entity, input: StimulusInput): void {
    const alert = this.ensure(state, guard);
    const prev = alert.level;

    // Compliance gate — the cardboard-box mechanic. Sighting a GREEN
    // player is a no-op; YELLOW degrades to a CAUTION-grade stimulus;
    // RED is the existing "see-and-chase" behaviour.
    const tier = state.player.compliance;
    const sees = input.seesPlayer && tier !== "GREEN";
    const seesAsAlert = sees && tier === "RED";

    if (seesAsAlert) {
      // Confirmed sighting against an exposed player — full ALERT.
      alert.lastStimulus = input.playerPos;
      alert.lastStimulusRoom = input.playerRoomId;
      alert.lastSeenTurn = state.turn;
      if (alert.level !== "ALERT") {
        alert.level = "ALERT";
        alert.enteredTurn = state.turn;
        eventBus.emit("EXCLAMATION_TRIGGERED", {
          guardId: guard.id,
          pos: guard.pos,
          roomId: guard.roomId,
        });
      }
    } else if (sees) {
      // YELLOW sighting — orient + investigate, no chase.
      alert.lastStimulus = input.playerPos;
      alert.lastStimulusRoom = input.playerRoomId;
      if (alert.level === "NORMAL") {
        alert.level = "CAUTION";
        alert.enteredTurn = state.turn;
      }
    } else if (input.heardIntensity >= ALERT_SOUND_THRESHOLD) {
      // Loud noise — jump straight to ALERT toward the source.
      if (input.heardSrc) {
        alert.lastStimulus = input.heardSrc.pos;
        alert.lastStimulusRoom = input.heardSrc.roomId;
      }
      if (alert.level !== "ALERT") {
        alert.level = "ALERT";
        alert.enteredTurn = state.turn;
        eventBus.emit("EXCLAMATION_TRIGGERED", {
          guardId: guard.id,
          pos: guard.pos,
          roomId: guard.roomId,
        });
      }
    } else if (input.heardIntensity >= CAUTION_SOUND_THRESHOLD) {
      if (input.heardSrc) {
        alert.lastStimulus = input.heardSrc.pos;
        alert.lastStimulusRoom = input.heardSrc.roomId;
      }
      if (alert.level === "NORMAL") {
        alert.level = "CAUTION";
        alert.enteredTurn = state.turn;
      }
    } else {
      // No stimulus this tick — let timers decay the state.
      const sinceEntry = state.turn - alert.enteredTurn;
      const sinceSeen = state.turn - (alert.lastSeenTurn ?? alert.enteredTurn);
      // While in active pursuit, keep the player's position fresh so the
      // chase routes to the right room across multi-room escapes. The
      // lose-of-sight timer below still caps how long pursuit lasts.
      if (alert.level === "ALERT" && input.playerRoomId) {
        alert.lastStimulusRoom = input.playerRoomId;
        if (input.playerPos) alert.lastStimulus = input.playerPos;
      }
      if (alert.level === "ALERT" && sinceSeen >= ALERT_LOSE_SIGHT_TURNS) {
        // Lost the player long enough — drop to EVASION and let the
        // pursuing guard scan, then return to patrol.
        alert.level = "EVASION";
        alert.enteredTurn = state.turn;
      } else if (alert.level === "EVASION" && sinceEntry >= EVASION_TIMEOUT) {
        alert.level = "NORMAL";
        alert.enteredTurn = state.turn;
        alert.lastStimulus = undefined;
        alert.lastStimulusRoom = undefined;
      } else if (alert.level === "CAUTION" && sinceEntry >= CAUTION_DECAY) {
        alert.level = "NORMAL";
        alert.enteredTurn = state.turn;
        alert.lastStimulus = undefined;
        alert.lastStimulusRoom = undefined;
      }
    }

    if (alert.level !== prev) {
      eventBus.emit("GUARD_ALERT_CHANGED", { guardId: guard.id, from: prev, to: alert.level });
    }
  }
}

export const alertFSM = new AlertFSM();
