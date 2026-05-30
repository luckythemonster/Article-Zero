import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  Entity,
  EntityKind,
  Facing,
  Room,
  RoomAtmosphere,
  Tile,
  TileKind,
  WorldState,
} from "../types/world.types";

// Mock the typed event bus so we can assert orderly events without wiring the
// real bus. vi.hoisted lets the mock be referenced inside the mock factory.
const mockEventBus = vi.hoisted(() => ({ emit: vi.fn(), on: vi.fn() }));
vi.mock("./EventBus", () => ({ eventBus: mockEventBus }));
const mockSoundField = vi.hoisted(() => ({
  emit: vi.fn(),
  deliver: vi.fn(() => new Map()),
  decay: vi.fn(),
}));
vi.mock("./SoundField", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./SoundField")>();
  return { ...actual, soundField: mockSoundField };
});

import { enforcerSystem } from "./EnforcerSystem";
import { NORMAL_SETPOINT, NORMAL_AIRFLOW } from "./AtmosphericsField";

function tile(kind: TileKind = "FLOOR"): Tile {
  return {
    kind,
    solid: kind === "WALL",
    opaque: kind === "WALL",
    elevation: 0,
  };
}

function makeRoom(id: string, w = 6, h = 6): Room {
  const tiles: Tile[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) tiles.push(tile("FLOOR"));
  }
  return {
    id,
    name: id,
    width: w,
    height: h,
    tiles,
    ambientLight: "LIT",
    doorways: [],
  };
}

function setTile(room: Room, x: number, y: number, kind: TileKind): void {
  room.tiles[y * room.width + x] = tile(kind);
}

function makeOrderly(id: string, x: number, y: number, facing: Facing = "south"): Entity {
  return {
    id,
    name: id,
    kind: "ORDERLY" as EntityKind,
    roomId: "main",
    pos: { x, y },
    z: 0,
    facing,
    status: "ACTIVE",
  } as Entity;
}

function defaultAtmo(roomId: string): RoomAtmosphere {
  return {
    roomId,
    temperature: NORMAL_SETPOINT,
    airflow: NORMAL_AIRFLOW,
    oxygen: 100,
  };
}

function makeState(rooms: Room[], orderlies: Entity[]): WorldState {
  const roomMap = new Map<string, Room>();
  for (const r of rooms) roomMap.set(r.id, r);
  const entityMap = new Map<string, Entity>();
  for (const e of orderlies) entityMap.set(e.id, e);
  return {
    era: "TEST_MAP",
    turn: 1,
    player: {
      roomId: rooms[0].id,
      pos: { x: 2, y: 2 },
      z: 0,
      facing: "south",
      ap: 4,
      apMax: 4,
      flashlightOn: false,
      flashlightBattery: 30,
      stance: "WALK",
      name: "TEST",
      qScore: 0,
      inventory: [],
      compliance: "GREEN",
    },
    rooms: roomMap,
    entities: entityMap,
    items: new Map(),
    visibleTiles: new Set(),
    alignmentLightActive: false,
    detected: false,
    detained: false,
    ventLinks: new Map(),
    terminalPayloads: new Map(),
    chestPayloads: new Map(),
    terminalsRead: new Set(),
    activeEmitters: [],
    activeMines: [],
    atmosphere: new Map([[rooms[0].id, defaultAtmo(rooms[0].id)]]),
    hvacZones: new Map(),
  } as unknown as WorldState;
}

describe("orderly Q0/code violation alarm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not arm an alarm when the player reads GREEN", () => {
    const room = makeRoom("main");
    setTile(room, 4, 0, "TERMINAL");
    const orderly = makeOrderly("ORDERLY-1", 0, 0, "south");
    const state = makeState([room], [orderly]);
    state.player.compliance = "GREEN";
    state.player.pos = { x: 0, y: 1 };

    enforcerSystem.tick(state, new Map());

    expect(orderly.alarm).toBeUndefined();
    expect(mockSoundField.emit).not.toHaveBeenCalled();
  });

  it("arms an alarm when a YELLOW player is in the orderly's cone", () => {
    const room = makeRoom("main");
    setTile(room, 4, 0, "TERMINAL");
    const orderly = makeOrderly("ORDERLY-1", 0, 0, "south");
    const state = makeState([room], [orderly]);
    state.player.compliance = "YELLOW";
    state.player.qScore = 1;
    state.player.pos = { x: 0, y: 1 };

    enforcerSystem.tick(state, new Map());

    expect(orderly.alarm).toBeDefined();
    expect(orderly.alarm?.phase).toBe("RUNNING");
    expect(orderly.alarm?.terminalPos).toEqual({ x: 4, y: 0 });
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      "ORDERLY_SPOTTED_VIOLATION",
      expect.objectContaining({ orderlyId: "ORDERLY-1", tier: "YELLOW" }),
    );
  });

  it("steps toward the terminal approach tile across turns", () => {
    const room = makeRoom("main");
    setTile(room, 4, 0, "TERMINAL");
    const orderly = makeOrderly("ORDERLY-1", 0, 0, "south");
    const state = makeState([room], [orderly]);
    state.player.compliance = "RED";
    state.player.pos = { x: 0, y: 1 };

    enforcerSystem.tick(state, new Map());
    const startX = orderly.pos.x;
    state.turn += 1;
    enforcerSystem.tick(state, new Map());

    expect(orderly.pos.x).toBeGreaterThan(startX);
    expect(orderly.alarm?.phase).toBe("RUNNING");
    expect(mockSoundField.emit).not.toHaveBeenCalled();
  });

  it("emits the alarm sound when adjacent to the terminal and enters cooldown", () => {
    const room = makeRoom("main");
    setTile(room, 4, 0, "TERMINAL");
    // Pre-place orderly already adjacent to the terminal at (3,0).
    const orderly = makeOrderly("ORDERLY-1", 3, 0, "south");
    const state = makeState([room], [orderly]);
    state.player.compliance = "RED";
    state.player.pos = { x: 3, y: 1 };

    enforcerSystem.tick(state, new Map());

    expect(mockSoundField.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "orderly-alarm",
        roomId: "main",
        pos: { x: 3, y: 1 },
      }),
    );
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      "ORDERLY_ALARM_RAISED",
      expect.objectContaining({ orderlyId: "ORDERLY-1", viaTerminal: true }),
    );
    expect(orderly.alarm?.phase).toBe("COOLDOWN");
    expect(orderly.facing).toBe("east"); // turned to face the terminal at (4,0)
  });

  it("shouts from current position when the room has no terminal", () => {
    const room = makeRoom("main");
    const orderly = makeOrderly("ORDERLY-1", 0, 0, "south");
    const state = makeState([room], [orderly]);
    state.player.compliance = "RED";
    state.player.pos = { x: 0, y: 1 };

    enforcerSystem.tick(state, new Map());

    expect(mockSoundField.emit).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "orderly-alarm" }),
    );
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      "ORDERLY_ALARM_RAISED",
      expect.objectContaining({ viaTerminal: false }),
    );
    expect(orderly.alarm?.phase).toBe("COOLDOWN");
  });
});
