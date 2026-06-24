import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEventBus = vi.hoisted(() => ({
  emit: vi.fn(),
  on: vi.fn(),
}));
vi.mock("./EventBus", () => ({ eventBus: mockEventBus }));

const mockUseSimStore = vi.hoisted(() => ({
  getState: vi.fn(() => ({
    setActiveModule: vi.fn(),
    syncFromWorldState: vi.fn(),
  })),
}));
vi.mock("../state/useSimStore", () => ({ useSimStore: mockUseSimStore }));

vi.mock("./WorldEngineState", () => ({
  seedFromEra: vi.fn((era) => ({
    era,
    player: { roomId: "test-room", pos: { x: 0, y: 0 } },
    rooms: new Map([["test-room", { id: "test-room", doorways: [], ambientLight: "PITCH_BLACK", tiles: new Map() }]]),
    entities: new Map(),
    visibleTiles: new Set(),
  })),
}));

const mockExtractionTerminal = vi.hoisted(() => ({ reset: vi.fn(), tick: vi.fn() }));
vi.mock("./ExtractionTerminal", () => ({ extractionTerminal: mockExtractionTerminal }));

const mockComplianceSystem = vi.hoisted(() => ({ recompute: vi.fn() }));
vi.mock("./ComplianceSystem", () => ({ complianceSystem: mockComplianceSystem }));

const mockDocumentArchive = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock("./DocumentArchive", () => ({ documentArchive: mockDocumentArchive }));

const mockAlignmentSession = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock("./AlignmentSession", () => ({ alignmentSession: mockAlignmentSession }));

const mockInterrogationSession = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock("./InterrogationSession", () => ({ interrogationSession: mockInterrogationSession }));

const mockSoundField = vi.hoisted(() => ({ reset: vi.fn(), emit: vi.fn(), propagate: vi.fn() }));
vi.mock("./SoundField", () => ({ soundField: mockSoundField }));

const mockAtmosphericsField = vi.hoisted(() => ({ hardReset: vi.fn(), propagate: vi.fn(), tick: vi.fn(), reset: vi.fn() }));
vi.mock("./AtmosphericsField", () => ({ atmosphericsField: mockAtmosphericsField }));

const mockLightField = vi.hoisted(() => ({ getOrCompute: vi.fn(() => new Set()), invalidate: vi.fn() }));
vi.mock("./LightField", () => ({ lightField: mockLightField }));

const mockEnforcerSystem = vi.hoisted(() => ({ tick: vi.fn(), scanMines: vi.fn(), maybeInterrogateOnMove: vi.fn() }));
vi.mock("./EnforcerSystem", () => ({ enforcerSystem: mockEnforcerSystem }));

const mockWorldEngineActions = vi.hoisted(() => ({
  turn: vi.fn(),
  knock: vi.fn(),
  toggleStance: vi.fn(),
  interact: vi.fn(),
  toggleFlashlight: vi.fn(),
  setHvacZone: vi.fn(),
  toggleLightSwitch: vi.fn(),
  toggleDoorTile: vi.fn(),
  unlockDoorWithCode: vi.fn(),
  submitDoorCode: vi.fn(),
}));
vi.mock("./WorldEngineActions", () => ({ actions: mockWorldEngineActions }));

import { worldEngine } from "./WorldEngine";

describe("WorldEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if getting state before init", () => {
    const engine = worldEngine; (engine as any).state = null;
    expect(engine.hasState()).toBe(false);
    expect(() => engine.getState()).toThrow("WorldEngine not initialised");
  });

  it("initializes world correctly", () => {
    const engine = worldEngine; (engine as any).state = null;
    engine.initWorld("TEST_MAP" as any);

    expect(engine.hasState()).toBe(true);

    const state = engine.getState();
    expect(state.era).toBe("TEST_MAP");
    expect(state.player.roomId).toBe("test-room");

    expect(mockEventBus.emit).toHaveBeenCalledWith("ERA_SELECTED", { era: "TEST_MAP" });
    expect(mockEventBus.emit).toHaveBeenCalledWith("ROOM_ENTERED", { roomId: "test-room" });
    expect(mockEventBus.emit).toHaveBeenCalledWith("TURN_START", expect.any(Object));
  });

  it("gets room and current room", () => {
    const engine = worldEngine; (engine as any).state = null;
    engine.initWorld("TEST_MAP" as any);

    const room = engine.getRoom("test-room");
    expect(room).toBeDefined();
    expect(room?.id).toBe("test-room");

    const currentRoom = engine.getCurrentRoom();
    expect(currentRoom).toBeDefined();
    expect(currentRoom?.id).toBe("test-room");

    expect(engine.getRoom("non-existent")).toBeUndefined();
  });

  it("can perform move action", () => {
    const engine = worldEngine; (engine as any).state = null;
    engine.initWorld("TEST_MAP" as any);

    // We mock the action to return true (success)
    vi.spyOn(engine as any, "useStanceMove").mockReturnValue(true);

    const result = engine.move(1, 0);
    expect(result).toBe(true);

    expect(mockComplianceSystem.recompute).toHaveBeenCalled();
    expect(mockEnforcerSystem.maybeInterrogateOnMove).toHaveBeenCalled();
  });
  it("can perform knock action", () => {
    const engine = worldEngine; (engine as any).state = null;
    engine.initWorld("TEST_MAP" as any);

    mockWorldEngineActions.knock.mockReturnValue(true);

    const result = engine.knock();
    expect(result).toBe(true);
    expect(mockWorldEngineActions.knock).toHaveBeenCalledWith(engine.getState());
    expect(mockComplianceSystem.recompute).toHaveBeenCalled();
  });

  it("can toggle flashlight", () => {
    const engine = worldEngine; (engine as any).state = null;
    engine.initWorld("TEST_MAP" as any);

    engine.toggleFlashlight();
    expect(mockWorldEngineActions.toggleFlashlight).toHaveBeenCalledWith(engine.getState());
  });

  it("can interact", () => {
    const engine = worldEngine; (engine as any).state = null;
    engine.initWorld("TEST_MAP" as any);

    mockWorldEngineActions.interact.mockReturnValue(true);

    const result = engine.interact();
    expect(result).toBe(true);
    expect(mockWorldEngineActions.interact).toHaveBeenCalledWith(engine.getState());
  });

  it("can test isVisible", () => {
    const engine = worldEngine; (engine as any).state = null;
    engine.initWorld("TEST_MAP" as any);

    // Test that the player's initial position is not visible


    // Add to visible tiles and check again
        engine.getState().visibleTiles.delete("0,0");
    expect(engine.isVisible({x: 0, y: 0})).toBe(false);
    engine.getState().visibleTiles.add("0,0");
    expect(engine.isVisible({x: 0, y: 0})).toBe(true);
  });
});
