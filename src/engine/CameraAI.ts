// CameraAI — surveillance cameras with a slowly rotating cone. Spotting the
// player raises the floor to ALERT, logs an UNAUTHORIZED_ACCESS violation,
// and emits a CAMERA_ALARM noise so nearby enforcers converge.
//
// Cameras don't move. Their facing cycles through entity.rotationPattern,
// one step per world turn (state.turn % pattern.length). Concealment hides
// the player from cameras the same way it hides from enforcer cones.

import type { Entity, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";
import { hasLineOfSight, isInVisionCone } from "./visionCone";
import { alertSystem } from "./AlertSystem";
import { noiseSystem } from "./NoiseSystem";

const DEFAULT_CAMERA_RANGE = 6;
const DEFAULT_CAMERA_HALF_ANGLE = 30;

class CameraAI {
  reset(): void {}

  tick(state: WorldState): void {
    for (const entity of state.entities.values()) {
      if (entity.kind !== "CAMERA" || entity.status !== "ACTIVE") continue;
      this.advanceRotation(state, entity);
      if (state.concealedEntityId) continue; // hidden from cameras too
      if (entity.pos.z !== state.player.pos.z) continue;

      const range = entity.coneRange ?? DEFAULT_CAMERA_RANGE;
      const halfAngle = entity.coneHalfAngleDeg ?? DEFAULT_CAMERA_HALF_ANGLE;
      const inCone = isInVisionCone(
        entity.pos,
        entity.facing,
        state.player.pos,
        range,
        halfAngle,
      );
      if (!inCone) continue;
      if (!hasLineOfSight(state, entity.pos, state.player.pos)) continue;

      eventBus.emit("CAMERA_SPOTTED", { cameraId: entity.id, pos: entity.pos });
      // Cameras don't grab — they trip the alarm. Log a violation so any
      // existing enforcer who also gains LOS can detain.
      state.violations.push({
        type: "UNAUTHORIZED_ACCESS",
        turn: state.turn,
      });
      noiseSystem.emit(state, {
        pos: entity.pos,
        radius: 8,
        source: "CAMERA_ALARM",
      });
      // Escalate every enforcer on the floor via the spotter pathway. The
      // camera plays the spotter so the floor max ends up at ALERT.
      alertSystem.raiseAlert(state, entity, state.player.pos);
    }
  }

  private advanceRotation(state: WorldState, entity: Entity): void {
    const pattern = entity.rotationPattern;
    if (!pattern || pattern.length <= 1) return;
    const idx = state.turn % pattern.length;
    if (entity.facing !== pattern[idx]) {
      entity.facing = pattern[idx];
    }
  }
}

export const cameraAI = new CameraAI();
