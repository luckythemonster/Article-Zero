import { describe, it, expect } from "vitest";
import { isExtractionTile } from "./ExtractionTerminal";
import type { Tile } from "../types/world.types";

describe("isExtractionTile", () => {
  it("returns true for a tile with kind EXTRACTION_TERMINAL", () => {
    const tile: Tile = { kind: "EXTRACTION_TERMINAL", solid: false, opaque: false, elevation: 0 };
    expect(isExtractionTile(tile)).toBe(true);
  });

  it("returns false for a tile with another kind", () => {
    const tile: Tile = { kind: "FLOOR", solid: false, opaque: false, elevation: 0 };
    expect(isExtractionTile(tile)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isExtractionTile(undefined)).toBe(false);
  });
});
