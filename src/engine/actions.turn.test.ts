import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorldState, Facing } from "../types/world.types";

// Mock eventBus before importing actions. vi.mock is hoisted, so the mock
// object must be created via vi.hoisted to be available inside the factory.
const mockEventBus = vi.hoisted(() => ({
  emit: vi.fn(),
  on: vi.fn(),
}));
vi.mock("./EventBus", () => ({ eventBus: mockEventBus }));

import { actions } from "./WorldEngineActions";

function makeState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    turn: 0,
    gamePhase: "FLOOR",
    detained: false,
    player: {
      ap: 5,
      apMax: 5,
      pos: { x: 0, y: 0 },
      facing: "north" as Facing,
      stance: "WALK",
      peeking: undefined,
      hidingTileKey: undefined,
      flashlightOn: false,
      roomId: "test-room",
      effects: [],
      lastMoveTurn: -1,
    },
    rooms: {},
    entities: {},
    ...overrides,
  } as WorldState;
}

describe("actions.turn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates facing and emits PLAYER_FACING_CHANGED", () => {
    const s = makeState();
    const ok = actions.turn(s, "east");
    expect(ok).toBe(true);
    expect(s.player.facing).toBe("east");
    expect(mockEventBus.emit).toHaveBeenCalledWith("PLAYER_FACING_CHANGED", {
      facing: "east",
    });
  });

  it("returns false and no-ops when already facing that way with no peek", () => {
    const s = makeState();
    const ok = actions.turn(s, "north");
    expect(ok).toBe(false);
    expect(s.player.facing).toBe("north");
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it("clears active peek and emits PLAYER_PEEKED", () => {
    const s = makeState({
      player: {
        ...makeState().player,
        facing: "north",
        peeking: "east" as Facing,
      },
    });
    const ok = actions.turn(s, "south");
    expect(ok).toBe(true);
    expect(s.player.peeking).toBeUndefined();
    expect(s.player.facing).toBe("south");
    expect(mockEventBus.emit).toHaveBeenCalledWith("PLAYER_PEEKED", {
      facing: null,
    });
    expect(mockEventBus.emit).toHaveBeenCalledWith("PLAYER_FACING_CHANGED", {
      facing: "south",
    });
  });

  it("returns false when detained", () => {
    const s = makeState({ detained: true });
    const ok = actions.turn(s, "east");
    expect(ok).toBe(false);
    expect(s.player.facing).toBe("north");
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it("returns false when hidden", () => {
    const s = makeState({
      player: { ...makeState().player, hidingTileKey: "test-room:0,0" },
    });
    const ok = actions.turn(s, "east");
    expect(ok).toBe(false);
    expect(s.player.facing).toBe("north");
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it("returns true when clearing peek but facing the same way", () => {
    const s = makeState({
      player: {
        ...makeState().player,
        facing: "north",
        peeking: "east" as Facing,
      },
    });
    const ok = actions.turn(s, "north");
    expect(ok).toBe(true);
    expect(s.player.peeking).toBeUndefined();
    expect(mockEventBus.emit).toHaveBeenCalledWith("PLAYER_PEEKED", {
      facing: null,
    });
  });
});
