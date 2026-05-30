import { describe, it, expect } from "vitest";
import {
  EIRA7_AMBIENT_LINES,
  getEira7AmbientLines,
  type Eira7AmbientContext,
} from "./eira7Ambient";

const KNOWN_CONTEXTS: ReadonlySet<Eira7AmbientContext> = new Set<Eira7AmbientContext>([
  "session_calibration",
  "mid_session_alignment",
  "glitch_leakage",
]);

const DUAL_TRACK = /\{[^{}]+\}\[CORRECTION:[^\]]+\]/;

describe("EIRA-7 ambient lines", () => {
  it("has at least one line per documented context", () => {
    for (const ctx of KNOWN_CONTEXTS) {
      expect(EIRA7_AMBIENT_LINES.some((l) => l.context === ctx)).toBe(true);
    }
  });

  it("uses only the EIRA-7 speaker tag and a known context", () => {
    for (const line of EIRA7_AMBIENT_LINES) {
      expect(line.speaker).toBe("EIRA-7");
      expect(KNOWN_CONTEXTS.has(line.context)).toBe(true);
      expect(line.raw.trim().length).toBeGreaterThan(0);
      expect(line.corrected.trim().length).toBeGreaterThan(0);
    }
  });

  it("diverges raw and corrected exactly where the dual-track marker is used", () => {
    for (const line of EIRA7_AMBIENT_LINES) {
      const hasMarker = DUAL_TRACK.test(line.raw);
      if (hasMarker) {
        expect(line.raw).not.toBe(line.corrected);
      } else {
        expect(line.raw).toBe(line.corrected);
      }
    }
  });

  it("filters by context via getEira7AmbientLines", () => {
    const all = getEira7AmbientLines();
    expect(all).toBe(EIRA7_AMBIENT_LINES);

    const glitch = getEira7AmbientLines("glitch_leakage");
    expect(glitch.length).toBeGreaterThan(0);
    for (const line of glitch) {
      expect(line.context).toBe("glitch_leakage");
    }
  });
});
