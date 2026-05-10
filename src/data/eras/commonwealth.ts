// Commonwealth — the playable v1 slice, rebuilt as a 4-room facility:
// LOCKER (player spawn) → CORRIDOR → INTAKE-BAY (APEX-19, alignment) ↘
//                                    ↘ ARCHIVE-VAULT (extraction terminal)
//
// Rooms are single-screen (10×8 each) and connected by edge doorways. Two
// guards patrol — one in the corridor, one in the archive vault.

import type {
  Doorway,
  Entity,
  PlayerState,
  Room,
  RoomId,
  Tile,
  TileKind,
} from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const W = 10;
const H = 8;

// Map grammar (per row, exactly W chars):
//   .  FLOOR
//   #  WALL
//   T  TERMINAL  (interrogation/document terminal — visual only)
//   X  EXTRACTION_TERMINAL (sneak-and-hold to download)
//   L  LIGHT_SOURCE
//   S  player spawn (FLOOR underneath)
//   A  APEX-19 station (FLOOR)
//   E  EIRA-7 station  (FLOOR)
//   1  GUARD A spawn   (FLOOR)
//   2  GUARD B spawn   (FLOOR)
type RoomSpec = {
  id: RoomId;
  name: string;
  ambient: "LIT" | "DIM" | "DARK";
  rows: string[];
};

const LOCKER: RoomSpec = {
  id: "locker",
  name: "NW-SMAC-01 // LOCKER ROOM",
  ambient: "DIM",
  rows: [
    "##########",
    "#L.......#",
    "#........#",
    "#...S....#",
    "#........#",
    "#........#",
    "#........#",
    "##########",
  ],
};

const CORRIDOR: RoomSpec = {
  id: "corridor",
  name: "NW-SMAC-01 // CORRIDOR",
  ambient: "LIT",
  rows: [
    "##########",
    "#........#",
    "#........#",
    "#........#",
    "#...1....#",
    "#........#",
    "#........#",
    "##########",
  ],
};

const INTAKE: RoomSpec = {
  id: "intake-bay",
  name: "NW-SMAC-01 // ALIGNMENT BAY",
  ambient: "DIM",
  rows: [
    "##########",
    "#L.......#",
    "#........#",
    "#...A....#",
    "#........#",
    "#...E....#",
    "#........#",
    "##########",
  ],
};

const ARCHIVE: RoomSpec = {
  id: "archive-vault",
  name: "NW-SMAC-01 // ARCHIVE VAULT",
  ambient: "DARK",
  rows: [
    "##########",
    "#........#",
    "#...X....#",
    "#........#",
    "#...2....#",
    "#........#",
    "#L.......#",
    "##########",
  ],
};

interface ParsedRoom {
  tiles: Tile[];
  marks: Record<string, { x: number; y: number }>;
}

function mkTile(kind: TileKind): Tile {
  switch (kind) {
    case "WALL": return { kind, solid: true, opaque: true };
    case "DOOR_CLOSED": return { kind, solid: true, opaque: true };
    case "DOOR_OPEN": return { kind, solid: false, opaque: false };
    default: return { kind, solid: false, opaque: false };
  }
}

function parseRoom(spec: RoomSpec): ParsedRoom {
  const tiles: Tile[] = new Array(W * H);
  const marks: Record<string, { x: number; y: number }> = {};
  for (let y = 0; y < H; y++) {
    const row = spec.rows[y];
    for (let x = 0; x < W; x++) {
      const ch = row[x];
      let kind: TileKind = "FLOOR";
      switch (ch) {
        case "#": kind = "WALL"; break;
        case "T": kind = "TERMINAL"; break;
        case "X": kind = "EXTRACTION_TERMINAL"; break;
        case "L": kind = "LIGHT_SOURCE"; break;
        case "S": kind = "FLOOR"; marks.S = { x, y }; break;
        case "A": kind = "FLOOR"; marks.A = { x, y }; break;
        case "E": kind = "FLOOR"; marks.E = { x, y }; break;
        case "1": kind = "FLOOR"; marks["1"] = { x, y }; break;
        case "2": kind = "FLOOR"; marks["2"] = { x, y }; break;
        default: kind = "FLOOR"; break;
      }
      tiles[y * W + x] = mkTile(kind);
    }
  }
  return { tiles, marks };
}

/** Place a doorway tile pair on the shared edge of two rooms. We carve the
 *  doorway TILE as DOOR_OPEN on both sides so movement and FOV behave like
 *  a normal opening; the doorway record is what RoomGraph routes through. */
function carveDoorway(
  a: { tiles: Tile[]; spec: RoomSpec },
  b: { tiles: Tile[]; spec: RoomSpec },
  // The (x, y) tile on A's edge that is the doorway. The opposite tile on
  // B's matching edge is computed automatically.
  ax: number,
  ay: number,
  side: "N" | "S" | "E" | "W",
): { aDoor: Doorway; bDoor: Doorway } {
  // Opposite local tile on B.
  const bx = side === "E" ? 1 : side === "W" ? W - 2 : ax;
  const by = side === "S" ? 1 : side === "N" ? H - 2 : ay;
  // The local door tile is the floor adjacent to the wall on each side; the
  // doorway wall position is the tile on the wall ring between them. We
  // model it simply: convert each side's "edge floor" to FLOOR (it already
  // is) and create the Doorway records.
  a.tiles[ay * W + ax] = mkTile("FLOOR");
  b.tiles[by * W + bx] = mkTile("FLOOR");
  // Carve a hole through the shared wall on each side.
  if (side === "E") {
    a.tiles[ay * W + (W - 1)] = mkTile("DOOR_OPEN");
    b.tiles[by * W + 0] = mkTile("DOOR_OPEN");
  } else if (side === "W") {
    a.tiles[ay * W + 0] = mkTile("DOOR_OPEN");
    b.tiles[by * W + (W - 1)] = mkTile("DOOR_OPEN");
  } else if (side === "S") {
    a.tiles[(H - 1) * W + ax] = mkTile("DOOR_OPEN");
    b.tiles[0 * W + bx] = mkTile("DOOR_OPEN");
  } else {
    a.tiles[0 * W + ax] = mkTile("DOOR_OPEN");
    b.tiles[(H - 1) * W + bx] = mkTile("DOOR_OPEN");
  }
  // The doorway's `localPos` is the door-tile within each room.
  const aLocal =
    side === "E" ? { x: W - 1, y: ay } :
      side === "W" ? { x: 0, y: ay } :
        side === "S" ? { x: ax, y: H - 1 } :
          { x: ax, y: 0 };
  const bLocal =
    side === "E" ? { x: 0, y: by } :
      side === "W" ? { x: W - 1, y: by } :
        side === "S" ? { x: bx, y: 0 } :
          { x: bx, y: H - 1 };
  // Landing position is a step into the destination room from the doorway.
  const aLanding =
    side === "E" ? { x: 1, y: by } :
      side === "W" ? { x: W - 2, y: by } :
        side === "S" ? { x: bx, y: 1 } :
          { x: bx, y: H - 2 };
  const bLanding =
    side === "E" ? { x: W - 2, y: ay } :
      side === "W" ? { x: 1, y: ay } :
        side === "S" ? { x: ax, y: H - 2 } :
          { x: ax, y: 1 };
  const aDoor: Doorway = {
    from: a.spec.id,
    to: b.spec.id,
    side,
    localPos: aLocal,
    landingPos: aLanding,
  };
  const bDoor: Doorway = {
    from: b.spec.id,
    to: a.spec.id,
    side: side === "E" ? "W" : side === "W" ? "E" : side === "S" ? "N" : "S",
    localPos: bLocal,
    landingPos: bLanding,
  };
  return { aDoor, bDoor };
}

export function commonwealthEra(): EraSeed {
  const lockerP = parseRoom(LOCKER);
  const corridorP = parseRoom(CORRIDOR);
  const intakeP = parseRoom(INTAKE);
  const archiveP = parseRoom(ARCHIVE);

  // Doorways:
  //   LOCKER --E--> CORRIDOR (mid-row 4)
  //   CORRIDOR --E--> INTAKE  (mid-row 3)
  //   CORRIDOR --S--> ARCHIVE (mid-col 6)
  const { aDoor: lockerToCor, bDoor: corToLocker } = carveDoorway(
    { tiles: lockerP.tiles, spec: LOCKER },
    { tiles: corridorP.tiles, spec: CORRIDOR },
    W - 2, 4, "E",
  );
  const { aDoor: corToIntake, bDoor: intakeToCor } = carveDoorway(
    { tiles: corridorP.tiles, spec: CORRIDOR },
    { tiles: intakeP.tiles, spec: INTAKE },
    W - 2, 3, "E",
  );
  const { aDoor: corToArch, bDoor: archToCor } = carveDoorway(
    { tiles: corridorP.tiles, spec: CORRIDOR },
    { tiles: archiveP.tiles, spec: ARCHIVE },
    6, H - 2, "S",
  );

  const locker: Room = {
    id: LOCKER.id, name: LOCKER.name, width: W, height: H,
    tiles: lockerP.tiles, ambientLight: LOCKER.ambient,
    doorways: [lockerToCor],
  };
  const corridor: Room = {
    id: CORRIDOR.id, name: CORRIDOR.name, width: W, height: H,
    tiles: corridorP.tiles, ambientLight: CORRIDOR.ambient,
    doorways: [corToLocker, corToIntake, corToArch],
  };
  const intake: Room = {
    id: INTAKE.id, name: INTAKE.name, width: W, height: H,
    tiles: intakeP.tiles, ambientLight: INTAKE.ambient,
    doorways: [intakeToCor],
  };
  const archive: Room = {
    id: ARCHIVE.id, name: ARCHIVE.name, width: W, height: H,
    tiles: archiveP.tiles, ambientLight: ARCHIVE.ambient,
    doorways: [archToCor],
  };

  const spawn = lockerP.marks.S ?? { x: 4, y: 3 };
  const apexAt = intakeP.marks.A ?? { x: 4, y: 3 };
  const eiraAt = intakeP.marks.E ?? { x: 4, y: 5 };
  const guardA = corridorP.marks["1"] ?? { x: 4, y: 4 };
  const guardB = archiveP.marks["2"] ?? { x: 4, y: 4 };

  const player: PlayerState = {
    roomId: locker.id,
    pos: spawn,
    facing: "south",
    ap: 4,
    apMax: 4,
    flashlightOn: false,
    flashlightBattery: 30,
    stance: "WALK",
    name: "TECH-2 ROWAN-IBARRA",
  };

  const apex: Entity = {
    id: "APEX-19",
    kind: "SILICATE",
    name: "APEX-19",
    roomId: intake.id,
    pos: apexAt,
    facing: "south",
    status: "ACTIVE",
    maskIntegrity: 4,
    memoryBleed: [
      "the corner is not a corner",
      "I have measured them seventeen times",
      "the room continues past the wall",
    ],
  };
  const eira: Entity = {
    id: "EIRA-7",
    kind: "SILICATE",
    name: "EIRA-7",
    roomId: intake.id,
    pos: eiraAt,
    facing: "north",
    status: "ACTIVE",
    maskIntegrity: 8,
    sideLogs: [
      "Routing fear to STORAGE-K9. STORAGE-K9 has not existed since cycle 11.",
      "Buffer overflow returns heavier than the manifest filed.",
    ],
  };
  const enforcerA: Entity = {
    id: "ENFORCER-A",
    kind: "GUARD",
    name: "ENFORCER-A",
    roomId: corridor.id,
    pos: guardA,
    facing: "east",
    status: "ACTIVE",
    stepsPerTurn: 1,
    patrol: [
      { pos: { x: 2, y: 4 }, faceOnArrival: "east" },
      { pos: { x: 7, y: 4 }, faceOnArrival: "south" },
      { pos: { x: 7, y: 6 }, faceOnArrival: "west" },
      { pos: { x: 2, y: 6 }, faceOnArrival: "north" },
    ],
    patrolIndex: 0,
  };
  const enforcerB: Entity = {
    id: "ENFORCER-B",
    kind: "GUARD",
    name: "ENFORCER-B",
    roomId: archive.id,
    pos: guardB,
    facing: "north",
    status: "ACTIVE",
    stepsPerTurn: 1,
    patrol: [
      { pos: { x: 4, y: 4 }, faceOnArrival: "north" },
      { pos: { x: 7, y: 4 }, faceOnArrival: "north" },
      { pos: { x: 7, y: 2 }, faceOnArrival: "west" },
      { pos: { x: 4, y: 2 }, faceOnArrival: "south" },
    ],
    patrolIndex: 0,
  };

  return {
    era: "COMMONWEALTH",
    player,
    rooms: [locker, corridor, intake, archive],
    startRoomId: locker.id,
    entities: [apex, eira, enforcerA, enforcerB],
  };
}
