import { describe, it, expect, beforeEach } from "vitest";
import type { Room, Tile } from "../types/world.types";
import { lightField } from "./LightField";

function mockTile(kind: Tile["kind"] = "FLOOR", overrides: Partial<Tile> = {}): Tile {
  return {
    kind,
    solid: kind === "WALL",
    opaque: kind === "WALL",
    elevation: 0,
    ...overrides,
  };
}

function mockRoom(
  w: number,
  h: number,
  overrides: Partial<Room> = {}
): Room {
  const tiles: Tile[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      tiles.push(mockTile("FLOOR"));
    }
  }
  return {
    id: "test-room",
    name: "Test Room",
    width: w,
    height: h,
    tiles,
    ambientLight: "LIT",
    doorways: [],
    ...overrides,
  };
}

describe("LightField", () => {
  beforeEach(() => {
    // Reset instance cache if necessary, though it's bound to room objects.
  });

  it("fully lights a room without lightSwitches or bleedLights", () => {
    const room = mockRoom(3, 3);
    const lit = lightField.getOrCompute(room);
    expect(lit.size).toBe(9); // 3x3
    expect(lit.has("0,0")).toBe(true);
    expect(lit.has("2,2")).toBe(true);
  });

  it("gates light per tile when lightSwitches are defined", () => {
    const room = mockRoom(5, 5);
    room.lightSwitches = []; // Opt-in to light gating

    // Place a light at (2,2)
    room.tiles[2 * 5 + 2] = mockTile("LIGHT_SOURCE", { lightOn: true, emissionRadius: 1 });
    // Place a light at (4,4) that is OFF
    room.tiles[4 * 5 + 4] = mockTile("LIGHT_SOURCE", { lightOn: false, emissionRadius: 1 });

    const lit = lightField.getOrCompute(room);

    // The room is 5x5. (2,2) with radius 1 should light (2,2), and adjacent tiles up to radius 1.
    expect(lit.has("2,2")).toBe(true);
    expect(lit.has("2,1")).toBe(true);
    expect(lit.has("2,3")).toBe(true);
    expect(lit.has("1,2")).toBe(true);
    expect(lit.has("3,2")).toBe(true);

    // (4,4) is off
    expect(lit.has("4,4")).toBe(false);

    // Some far tile is unlit
    expect(lit.has("0,0")).toBe(false);
  });

  it("respects emissionRadius on LIGHT_SOURCE", () => {
    const room = mockRoom(10, 10);
    room.lightSwitches = [];

    // Light at (5,5) with radius 2
    room.tiles[5 * 10 + 5] = mockTile("LIGHT_SOURCE", { lightOn: true, emissionRadius: 2 });

    const lit = lightField.getOrCompute(room);

    expect(lit.has("5,5")).toBe(true);
    // Radius 2 includes 5,3
    expect(lit.has("5,3")).toBe(true);
    // Radius 2 doesn't include 5,2
    expect(lit.has("5,2")).toBe(false);
  });

  it("falls back to default radius when emissionRadius is undefined", () => {
    const room = mockRoom(10, 10);
    room.lightSwitches = [];

    // Light at (5,5) with default radius (4)
    room.tiles[5 * 10 + 5] = mockTile("LIGHT_SOURCE", { lightOn: true });

    const lit = lightField.getOrCompute(room);

    expect(lit.has("5,5")).toBe(true);
    // Default radius 4 includes 5,9
    expect(lit.has("5,9")).toBe(true);
  });

  it("adds bleedLights to the lit set", () => {
    const room = mockRoom(5, 5);
    // Room has no switches, but HAS bleed lights, meaning we opt-in to gating
    room.bleedLights = [
      { pos: { x: 1, y: 1 }, radius: 1 }
    ];

    const lit = lightField.getOrCompute(room);

    // Should be dark outside the bleed light
    expect(lit.has("4,4")).toBe(false);

    // Inside the bleed light should be lit
    expect(lit.has("1,1")).toBe(true);
    expect(lit.has("1,0")).toBe(true);
  });

  it("walls block light emissions", () => {
    const room = mockRoom(5, 5);
    room.lightSwitches = [];

    room.tiles[2 * 5 + 2] = mockTile("LIGHT_SOURCE", { lightOn: true, emissionRadius: 3 });
    // Wall to the right
    room.tiles[2 * 5 + 3] = mockTile("WALL");

    const lit = lightField.getOrCompute(room);

    // Wall tile itself should be visible
    expect(lit.has("3,2")).toBe(true);

    // Tile behind the wall should be dark
    expect(lit.has("4,2")).toBe(false);
  });

  it("caches and invalidates correctly", () => {
    const room = mockRoom(3, 3);
    room.lightSwitches = []; // Opt-in to light gating, so it starts dark

    const lit1 = lightField.getOrCompute(room);
    expect(lit1.size).toBe(0);

    // Modify the room (e.g., add a bleed light)
    room.bleedLights = [{ pos: { x: 0, y: 0 }, radius: 1 }];

    // Cache should still return the old set since we haven't invalidated
    const lit2 = lightField.getOrCompute(room);
    expect(lit2.size).toBe(0);

    // Now invalidate
    lightField.invalidate(room);
    const lit3 = lightField.getOrCompute(room);

    // Now it should be recomputed
    expect(lit3.size).toBeGreaterThan(0);
    expect(lit3.has("0,0")).toBe(true);
  });
});
