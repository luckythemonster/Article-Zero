import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  Doorway,
  Entity,
  HvacMode,
  HvacZone,
  Room,
  RoomAtmosphere,
  Tile,
  WorldState,
} from "../types/world.types";

const mockEventBus = vi.hoisted(() => ({ emit: vi.fn(), on: vi.fn() }));
vi.mock("./EventBus", () => ({ eventBus: mockEventBus }));

import {
  atmosphericsField,
  NORMAL_AIRFLOW,
  NORMAL_SETPOINT,
  OXYGEN_INCAP_THRESHOLD,
  OXYGEN_INCAP_TURNS,
  AIRFLOW_SOUND_DAMP_MAX,
  HVAC_RATE,
} from "./AtmosphericsField";

function tile(kind: Tile["kind"] = "FLOOR"): Tile {
  return {
    kind,
    solid: kind === "WALL",
    opaque: kind === "WALL",
    elevation: 0,
  };
}

function room(id: string, w = 6, h = 6, doorways: Doorway[] = []): Room {
  const tiles: Tile[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      tiles.push(tile("FLOOR"));
    }
  }
  return {
    id,
    name: id,
    width: w,
    height: h,
    tiles,
    ambientLight: "LIT",
    doorways,
  };
}

function makeState(
  rooms: Room[],
  zones: HvacZone[],
  atmosphere: RoomAtmosphere[],
  entities: Entity[] = [],
): WorldState {
  const roomMap = new Map<string, Room>();
  for (const r of rooms) roomMap.set(r.id, r);
  const entityMap = new Map<string, Entity>();
  for (const e of entities) entityMap.set(e.id, e);
  return {
    era: "TEST_MAP",
    turn: 1,
    player: {
      roomId: rooms[0].id,
      pos: { x: 0, y: 0 },
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
      compliance: "GREEN", objectives: [],
    },
    rooms: roomMap,
    entities: entityMap,
    items: new Map(),
    itemsByPos: new Map(),
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
    atmosphere: new Map(atmosphere.map((a) => [a.roomId, a])),
    hvacZones: new Map(zones.map((z) => [z.id, z])),
  };
}

function defaultAtmo(roomId: string, zoneId?: string): RoomAtmosphere {
  return {
    roomId,
    zoneId,
    temperature: NORMAL_SETPOINT,
    airflow: NORMAL_AIRFLOW,
    oxygen: 100,
  };
}

function zone(id: string, roomIds: string[], mode: HvacMode = "NORMAL"): HvacZone {
  return { id, roomIds, mode, setpoint: NORMAL_SETPOINT };
}

beforeEach(() => {
  vi.clearAllMocks();
  atmosphericsField.hardReset();
});

describe("AtmosphericsField.propagate", () => {
  it("nudges temperature according to HVAC_RATE in a single tick", () => {
    const s = makeState(
      [room("a")],
      [zone("z", ["a"], "MAX_COOL")],
      [defaultAtmo("a", "z")],
    );
    const atmo = s.atmosphere.get("a")!;
    const initialTemp = atmo.temperature;
    const initialAirflow = atmo.airflow;
    const expectedStep = HVAC_RATE * (initialAirflow / 100);

    atmosphericsField.propagate(s);

    expect(atmo.temperature).toBeCloseTo(initialTemp - expectedStep, 5);
  });

  it("drives a room toward MAX_COOL across several ticks", () => {
    const s = makeState(
      [room("a")],
      [zone("z", ["a"], "MAX_COOL")],
      [defaultAtmo("a", "z")],
    );
    for (let i = 0; i < 20; i++) atmosphericsField.propagate(s);
    const a = s.atmosphere.get("a")!;
    expect(a.temperature).toBeLessThan(NORMAL_SETPOINT - 4);
    expect(a.airflow).toBe(100);
  });

  it("drains oxygen under OXYGEN_CUTOFF", () => {
    const s = makeState(
      [room("a")],
      [zone("z", ["a"], "OXYGEN_CUTOFF")],
      [defaultAtmo("a", "z")],
    );
    atmosphericsField.propagate(s);
    expect(s.atmosphere.get("a")!.oxygen).toBeLessThan(100);
    for (let i = 0; i < 10; i++) atmosphericsField.propagate(s);
    expect(s.atmosphere.get("a")!.oxygen).toBeLessThan(20);
  });

  it("recovers oxygen when cutoff lifts", () => {
    const z = zone("z", ["a"], "OXYGEN_CUTOFF");
    const s = makeState([room("a")], [z], [defaultAtmo("a", "z")]);
    for (let i = 0; i < 20; i++) atmosphericsField.propagate(s);
    expect(s.atmosphere.get("a")!.oxygen).toBeLessThan(10);
    z.mode = "NORMAL";
    for (let i = 0; i < 20; i++) atmosphericsField.propagate(s);
    expect(s.atmosphere.get("a")!.oxygen).toBeGreaterThan(90);
  });

  it("bleeds harder through open doorways than closed ones", () => {
    const doorway = (
      from: string,
      to: string,
      closed: boolean,
    ): Doorway => ({
      from,
      to,
      side: "E",
      localPos: { x: 5, y: 0 },
      landingPos: { x: 0, y: 0 },
      closed,
    });
    const openA = room("openA", 6, 6, [doorway("openA", "openB", false)]);
    const openB = room("openB", 6, 6, [doorway("openB", "openA", false)]);
    const closedA = room("closedA", 6, 6, [doorway("closedA", "closedB", true)]);
    const closedB = room("closedB", 6, 6, [doorway("closedB", "closedA", true)]);
    const s = makeState(
      [openA, openB, closedA, closedB],
      [
        zone("zo", ["openA"], "MAX_HEAT"),
        zone("zoB", ["openB"]),
        zone("zc", ["closedA"], "MAX_HEAT"),
        zone("zcB", ["closedB"]),
      ],
      [
        defaultAtmo("openA", "zo"),
        defaultAtmo("openB", "zoB"),
        defaultAtmo("closedA", "zc"),
        defaultAtmo("closedB", "zcB"),
      ],
    );
    for (let i = 0; i < 30; i++) atmosphericsField.propagate(s);
    const openBleed =
      s.atmosphere.get("openB")!.temperature - NORMAL_SETPOINT;
    const closedBleed =
      s.atmosphere.get("closedB")!.temperature - NORMAL_SETPOINT;
    expect(openBleed).toBeGreaterThan(closedBleed);
  });

  it("populates fog cache only when cold AND windy", () => {
    const a = room("a");
    a.tiles[0] = tile("VENT");
    const s = makeState(
      [a],
      [zone("z", ["a"], "MAX_COOL")],
      [defaultAtmo("a", "z")],
    );
    // Force cold + windy quickly by setting atmo directly.
    const atmo = s.atmosphere.get("a")!;
    atmo.temperature = 4;
    atmo.airflow = 100;
    atmosphericsField.propagate(s);
    expect(atmosphericsField.getFoggedTiles(s, a).size).toBeGreaterThan(0);

    // Now warm the room; fog clears next propagate.
    atmo.temperature = 22;
    atmosphericsField.propagate(s);
    expect(atmosphericsField.getFoggedTiles(s, a).size).toBe(0);
  });

  it("nudges airflow by AIRFLOW_RATE towards the target", () => {
    // Initial airflow is NORMAL_AIRFLOW (50)
    // Target airflow for MAX_COOL is 100
    // AIRFLOW_RATE is 8
    const s = makeState(
      [room("a")],
      [zone("z", ["a"], "MAX_COOL")],
      [defaultAtmo("a", "z")],
    );

    // One tick should increase airflow by AIRFLOW_RATE
    atmosphericsField.propagate(s);
    expect(s.atmosphere.get("a")!.airflow).toBe(NORMAL_AIRFLOW + 8); // 58

    // Multiple ticks should eventually cap at 100
    for (let i = 0; i < 20; i++) atmosphericsField.propagate(s);
    expect(s.atmosphere.get("a")!.airflow).toBe(100);

    // Now switch to NORMAL mode (target 50) and test decrease
    const z = s.hvacZones.get("z")!;
    z.mode = "NORMAL";
    atmosphericsField.propagate(s);
    expect(s.atmosphere.get("a")!.airflow).toBe(100 - 8); // 92
  });
});

describe("AtmosphericsField.tick — oxygen incapacitation", () => {
  function orderly(roomId: string): Entity {
    return {
      id: "ORDERLY-1",
      kind: "ORDERLY",
      name: "ORDERLY",
      roomId,
      pos: { x: 1, y: 1 },
      z: 0,
      facing: "south",
      status: "ACTIVE",
    };
  }
  function silicate(roomId: string): Entity {
    return {
      id: "APEX-19",
      kind: "SILICATE",
      name: "APEX-19",
      roomId,
      pos: { x: 2, y: 2 },
      z: 0,
      facing: "south",
      status: "ACTIVE",
    };
  }
  function enforcer(roomId: string): Entity {
    return {
      id: "ENF-1",
      kind: "ENFORCER",
      name: "ENF",
      roomId,
      pos: { x: 3, y: 3 },
      z: 0,
      facing: "south",
      status: "ACTIVE",
    };
  }

  it("incapacitates ORDERLY in low-O₂ room", () => {
    const a = room("a");
    const ent = orderly("a");
    const s = makeState(
      [a],
      [zone("z", ["a"], "OXYGEN_CUTOFF")],
      [defaultAtmo("a", "z")],
      [ent],
    );
    s.atmosphere.get("a")!.oxygen = OXYGEN_INCAP_THRESHOLD - 5;
    atmosphericsField.tick(s);
    expect(ent.status).toBe("DORMANT");
    expect(ent.disabledTurnsRemaining).toBe(OXYGEN_INCAP_TURNS);
  });

  it("does not touch silicates or enforcers", () => {
    const a = room("a");
    const sil = silicate("a");
    const enf = enforcer("a");
    const s = makeState(
      [a],
      [zone("z", ["a"], "OXYGEN_CUTOFF")],
      [defaultAtmo("a", "z")],
      [sil, enf],
    );
    s.atmosphere.get("a")!.oxygen = 5;
    atmosphericsField.tick(s);
    expect(sil.status).toBe("ACTIVE");
    expect(sil.disabledTurnsRemaining).toBeUndefined();
    expect(enf.status).toBe("ACTIVE");
    expect(enf.disabledTurnsRemaining).toBeUndefined();
  });
});

describe("AtmosphericsField.airflowDampFor", () => {
  it("returns 0 below threshold and scales to AIRFLOW_SOUND_DAMP_MAX at 100", () => {
    const s = makeState(
      [room("a")],
      [zone("z", ["a"])],
      [defaultAtmo("a", "z")],
    );
    expect(atmosphericsField.airflowDampFor(s, "a")).toBeCloseTo(
      ((50 - 30) / 70) * AIRFLOW_SOUND_DAMP_MAX,
      5,
    );
    s.atmosphere.get("a")!.airflow = 25;
    expect(atmosphericsField.airflowDampFor(s, "a")).toBe(0);
    s.atmosphere.get("a")!.airflow = 100;
    expect(atmosphericsField.airflowDampFor(s, "a")).toBeCloseTo(
      AIRFLOW_SOUND_DAMP_MAX,
      5,
    );
  });
});
