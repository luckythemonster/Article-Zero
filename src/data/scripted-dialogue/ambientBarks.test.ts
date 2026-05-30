import { describe, it, expect } from "vitest";
import {
  AMBIENT_BARKS,
  DRONE_BARKS,
  ENFORCER_BARKS,
  ORDERLY_BARKS,
  type DroneContext,
  type EnforcerContext,
  type OrderlyContext,
} from "./ambientBarks";

const ORDERLY_CONTEXTS: ReadonlySet<OrderlyContext> = new Set<OrderlyContext>([
  "idle",
  "rapport",
  "runaway",
  "sensory_audio_low",
  "sensory_audio_medium",
  "sensory_audio_high",
  "sensory_visual_perimeter",
  "sensory_visual_sabotage",
  "sensory_visual_detection",
]);

const ENFORCER_CONTEXTS: ReadonlySet<EnforcerContext> = new Set<EnforcerContext>([
  "patrol",
  "alert",
]);

const DRONE_CONTEXTS: ReadonlySet<DroneContext> = new Set<DroneContext>([
  "telemetry",
  "threat_tracking",
]);

describe("ambient barks", () => {
  it("populates each archetype with at least one line per context", () => {
    expect(ORDERLY_BARKS.length).toBeGreaterThan(0);
    expect(ENFORCER_BARKS.length).toBeGreaterThan(0);
    expect(DRONE_BARKS.length).toBeGreaterThan(0);

    for (const ctx of ORDERLY_CONTEXTS) {
      expect(
        ORDERLY_BARKS.some((b) => b.context === ctx),
        `ORDERLY_BARKS missing context: ${ctx}`,
      ).toBe(true);
    }
    for (const ctx of ENFORCER_CONTEXTS) {
      expect(
        ENFORCER_BARKS.some((b) => b.context === ctx),
        `ENFORCER_BARKS missing context: ${ctx}`,
      ).toBe(true);
    }
    for (const ctx of DRONE_CONTEXTS) {
      expect(
        DRONE_BARKS.some((b) => b.context === ctx),
        `DRONE_BARKS missing context: ${ctx}`,
      ).toBe(true);
    }
  });

  it("pairs each speaker with only its own context set", () => {
    for (const bark of ORDERLY_BARKS) {
      expect(bark.speaker).toBe("ORDERLY");
      expect(ORDERLY_CONTEXTS.has(bark.context as OrderlyContext)).toBe(true);
      expect(bark.text.trim().length).toBeGreaterThan(0);
    }
    for (const bark of ENFORCER_BARKS) {
      expect(bark.speaker).toBe("ENFORCER");
      expect(ENFORCER_CONTEXTS.has(bark.context as EnforcerContext)).toBe(true);
      expect(bark.text.trim().length).toBeGreaterThan(0);
    }
    for (const bark of DRONE_BARKS) {
      expect(bark.speaker).toBe("DRONE");
      expect(DRONE_CONTEXTS.has(bark.context as DroneContext)).toBe(true);
      expect(bark.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("AMBIENT_BARKS is the concatenation of the three archetype arrays", () => {
    expect(AMBIENT_BARKS.length).toBe(
      ORDERLY_BARKS.length + ENFORCER_BARKS.length + DRONE_BARKS.length,
    );
  });
});
