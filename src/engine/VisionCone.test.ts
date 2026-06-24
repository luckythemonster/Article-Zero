import { describe, it, expect } from "vitest";
import { computeCone } from "./VisionCone";
import type { Tile } from "../types/world.types";

describe("VisionCone.computeCone", () => {
  const createTiles = (width: number, height: number, opaqueCoords: [number, number][] = []): Tile[] => {
    const tiles = Array(width * height).fill(null).map(() => ({ opaque: false } as Tile));
    for (const [x, y] of opaqueCoords) {
      tiles[y * width + x].opaque = true;
    }
    return tiles;
  };

  it("computes omnidirectional vision correctly without obstacles", () => {
    const width = 5;
    const height = 5;
    const tiles = createTiles(width, height);

    const visible = computeCone({
      tiles,
      width,
      height,
      ox: 2,
      oy: 2,
      radius: 2
    });

    // Within radius
    expect(visible.has("2,2")).toBe(true);
    expect(visible.has("3,2")).toBe(true);
    expect(visible.has("1,2")).toBe(true);
    expect(visible.has("2,1")).toBe(true);
    expect(visible.has("2,3")).toBe(true);
    expect(visible.has("1,1")).toBe(true);
    expect(visible.has("3,3")).toBe(true);
    expect(visible.has("0,2")).toBe(true); // distance 4 <= 4

    // Outside radius (distance squared > 4)
    // (0,0) distance squared = 4 + 4 = 8
    expect(visible.has("0,0")).toBe(false);
    // (4,4) distance squared = 4 + 4 = 8
    expect(visible.has("4,4")).toBe(false);
  });

  it("blocks vision when hitting an opaque tile", () => {
    const width = 5;
    const height = 5;
    // Opaque tile at (3,2) - East of origin
    const tiles = createTiles(width, height, [[3, 2]]);

    const visible = computeCone({
      tiles,
      width,
      height,
      ox: 2,
      oy: 2,
      radius: 2
    });

    expect(visible.has("2,2")).toBe(true);
    // The obstacle itself is visible
    expect(visible.has("3,2")).toBe(true);
    // But tiles behind it are not
    expect(visible.has("4,2")).toBe(false);
    // Other directions should still be visible
    expect(visible.has("1,2")).toBe(true);
  });

  it("computes directional vision correctly", () => {
    const width = 5;
    const height = 5;
    const tiles = createTiles(width, height);

    const visible = computeCone({
      tiles,
      width,
      height,
      ox: 2,
      oy: 2,
      radius: 2,
      facing: "east",
      halfAngle: Math.PI / 4 // 45 degrees, so sees roughly east but not north/south
    });

    expect(visible.has("2,2")).toBe(true); // Origin is always visible
    expect(visible.has("3,2")).toBe(true); // East
    expect(visible.has("4,2")).toBe(true); // East

    // These should be outside the 90 degree cone (45 degrees each way from East)
    expect(visible.has("2,1")).toBe(false); // North
    expect(visible.has("1,2")).toBe(false); // West
    expect(visible.has("2,3")).toBe(false); // South
  });

  it("handles map boundaries correctly", () => {
    const width = 3;
    const height = 3;
    const tiles = createTiles(width, height);

    const visible = computeCone({
      tiles,
      width,
      height,
      ox: 1,
      oy: 1,
      radius: 5 // Large radius that goes beyond bounds
    });

    // Should include tiles up to the edges
    expect(visible.has("0,0")).toBe(true);
    expect(visible.has("2,2")).toBe(true);

    // Should not include tiles outside the map bounds
    expect(visible.has("3,1")).toBe(false);
    expect(visible.has("1,-1")).toBe(false);
    expect(visible.has("-1,1")).toBe(false);
    expect(visible.has("1,3")).toBe(false);
  });

  it("computes directional vision correctly for south", () => {
    const width = 5;
    const height = 5;
    const tiles = createTiles(width, height);

    const visible = computeCone({
      tiles,
      width,
      height,
      ox: 2,
      oy: 2,
      radius: 2,
      facing: "south",
      halfAngle: Math.PI / 4 // 45 degrees
    });

    expect(visible.has("2,2")).toBe(true); // Origin
    expect(visible.has("2,3")).toBe(true); // South
    expect(visible.has("2,4")).toBe(true); // South

    // East, North, West should be blocked
    expect(visible.has("3,2")).toBe(false); // East
    expect(visible.has("2,1")).toBe(false); // North
    expect(visible.has("1,2")).toBe(false); // West
  });
});
