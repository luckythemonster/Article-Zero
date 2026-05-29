// TEST_MAP — Lucky's "New World" test level (Ed glyph/colour export, V3.5).
//
// This Ed project is authored in glyph/colour mode (semantic `Ref` + `Char` +
// `BackgroundColor`, no sprite keyframes), so its bundled spritesheet is not a
// usable tile atlas. We import only the geometry/semantics via
// `scripts/import-edplay.mjs` (→ TEST_MAP_LEVELS + TEST_MAP_REFS) and let the
// engine's built-in TileKind renderer draw the map — the moose `decoration`
// overlay is stripped below.
//
// V3.5 is dual-layer: Ed "Level 1" → the `deck` room, Ed "Level 2" → the
// `sublevel` sub-deck. The two are joined by one doorway — the deck's vent
// drops to the sub-deck ladder ("ladders connect with vents"), mirroring the
// vent↔ladder pattern in `nwSmac01.ts`. Vent and ladder positions are derived
// from the painted data so they stay correct across map revisions.
//
// Layer semantics: floor/walls/doors/light_sources/terminals/exfil_point are
// turned into tiles by from-moose's layer-name table. `enemies` is a mixed
// patrol-zone board (enforcer-area + drone-area cells, told apart by
// TEST_MAP_REFS); `NPCs` is an orderly patrol zone; `cameras`, `items` and
// `silicates` are single-purpose marker boards.

import { mooseToEraSeed } from "./from-moose";
import type { MooseEraMeta } from "./from-moose";
import { mkTile } from "./tile-factory";
import {
  TEST_MAP_V_3_5_LEVELS as TEST_MAP_LEVELS,
  TEST_MAP_V_3_5_REFS as TEST_MAP_REFS,
  TEST_MAP_V_3_5_COMPONENTS as TEST_MAP_COMPONENTS,
} from "../tilesets/test_map_v_3_5.levels";
import type { MooseLevel } from "../tilesets/types";
import type { ChestPayload, Entity, ItemType, LightSwitch, PatrolNode, Vec2 } from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const DECK_ID = "deck";
const SUBLEVEL_ID = "sublevel";

/** Every painted cell on a layer whose base-name (Ed " N" suffix stripped,
 *  lowercased) equals `baseName`. */
function paintedCells(level: MooseLevel, baseName: string): Vec2[] {
  const target = baseName.toLowerCase();
  const out: Vec2[] = [];
  for (const layer of level.layers) {
    const base = layer.name.trim().toLowerCase().replace(/\s+\d+$/, "");
    if (base !== target) continue;
    for (let y = 0; y < layer.data.length; y++) {
      const row = layer.data[y];
      for (let x = 0; x < row.length; x++) {
        if ((row[x] ?? 0) !== 0) out.push({ x, y });
      }
    }
  }
  return out;
}

/** Painted cells on `baseName` whose per-cell Ref (via TEST_MAP_REFS) contains
 *  `refSubstr`. Lets one board carry several entity kinds (e.g. enforcer-area
 *  vs surveillance-drone cells share the "enemies" board). */
function cellsWithRef(level: MooseLevel, baseName: string, refSubstr: string): Vec2[] {
  const target = baseName.toLowerCase();
  const needle = refSubstr.toLowerCase();
  const out: Vec2[] = [];
  for (const layer of level.layers) {
    const base = layer.name.trim().toLowerCase().replace(/\s+\d+$/, "");
    if (base !== target) continue;
    for (let y = 0; y < layer.data.length; y++) {
      const row = layer.data[y];
      for (let x = 0; x < row.length; x++) {
        const code = row[x] ?? 0;
        if (code === 0) continue;
        const ref = (TEST_MAP_REFS[code] ?? "").toLowerCase();
        if (ref.includes(needle)) out.push({ x, y });
      }
    }
  }
  return out;
}

/** Like `paintedCells`, but keeps each cell's per-Ref code so the caller can
 *  look the cell up in TEST_MAP_COMPONENTS (switch wiring, locked doors, …). */
function paintedCellsWithCode(level: MooseLevel, baseName: string): { pos: Vec2; code: number }[] {
  const target = baseName.toLowerCase();
  const out: { pos: Vec2; code: number }[] = [];
  for (const layer of level.layers) {
    const base = layer.name.trim().toLowerCase().replace(/\s+\d+$/, "");
    if (base !== target) continue;
    for (let y = 0; y < layer.data.length; y++) {
      const row = layer.data[y];
      for (let x = 0; x < row.length; x++) {
        const code = row[x] ?? 0;
        if (code !== 0) out.push({ pos: { x, y }, code });
      }
    }
  }
  return out;
}

function key(p: Vec2): string {
  return `${p.x},${p.y}`;
}

/** Map an Ed item-chest content name (e.g. "key_5", "EMP_grenade") to an engine
 *  ItemType. Matching is fuzzy because Ed authoring is free-text; unknown names
 *  are dropped (warned) so a typo fails soft instead of crashing the seed. */
function resolveItemName(raw: string): ItemType | null {
  const s = raw.trim().toLowerCase();
  if (s.includes("emp") && s.includes("grenade")) return "EMP_GRENADE";
  if (s === "emp") return "EMP";
  if (s.includes("mine")) return "Q_MINE";
  if (s.includes("key") || s.includes("override")) return "OVERRIDE_KEY";
  if (s.includes("baffle")) return "THERMAL_BAFFLE";
  if (s.includes("badge") || s.includes("spoof")) return "Q0_SPOOF_BADGE";
  if (s.includes("phantom") || s.includes("emitter")) return "PHANTOM_EMITTER";
  if (s.includes("dump") || s.includes("fragment")) return "DUMP_FRAGMENT";
  if (s.includes("bypass")) return "BYPASS_DRIVE";
  if (s.includes("cube")) return "EXTRACTION_CUBE";
  const known: ItemType[] = [
    "EXTRACTION_CUBE", "BYPASS_DRIVE", "PHANTOM_EMITTER", "Q0_SPOOF_BADGE",
    "DUMP_FRAGMENT", "THERMAL_BAFFLE", "OVERRIDE_KEY", "EMP", "EMP_GRENADE",
    "Q_MINE",
  ];
  const upper = raw.trim().toUpperCase() as ItemType;
  if (known.includes(upper)) return upper;
  console.warn(`[testMap] unknown item-chest content "${raw}" — skipped`);
  return null;
}

/** Walkable cells = floor minus walls minus closed doors. Used to keep patrol
 *  nodes and the player spawn off of solid tiles. */
function walkableSet(level: MooseLevel): Set<string> {
  const walk = new Set(paintedCells(level, "floor").map(key));
  for (const w of paintedCells(level, "walls")) walk.delete(key(w));
  for (const d of paintedCells(level, "doors")) walk.delete(key(d));
  return walk;
}

function centroidNearest(cells: Vec2[], walkable: Set<string>): Vec2 {
  if (cells.length === 0) return { x: 0, y: 0 };
  const cx = cells.reduce((s, c) => s + c.x, 0) / cells.length;
  const cy = cells.reduce((s, c) => s + c.y, 0) / cells.length;
  const pool = cells.filter((c) => walkable.has(key(c)));
  const search = pool.length > 0 ? pool : cells;
  let best = search[0];
  let bestD = Infinity;
  for (const c of search) {
    const d = (c.x - cx) ** 2 + (c.y - cy) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Up to 4 spread "extreme" cells of a blob, forming a loop that traverses it. */
function patrolRoute(cells: Vec2[], walkable: Set<string>): PatrolNode[] {
  const pool = cells.filter((c) => walkable.has(key(c)));
  const search = pool.length > 0 ? pool : cells;
  const pick = (score: (c: Vec2) => number): Vec2 =>
    search.reduce((best, c) => (score(c) < score(best) ? c : best), search[0]);
  const corners = [
    pick((c) => c.x + c.y),       // top-left
    pick((c) => -(c.x + c.y)),    // bottom-right
    pick((c) => c.x - c.y),       // bottom-left
    pick((c) => -(c.x - c.y)),    // top-right
  ];
  const seen = new Set<string>();
  const route: PatrolNode[] = [];
  for (const c of corners) {
    if (seen.has(key(c))) continue;
    seen.add(key(c));
    route.push({ pos: c });
  }
  return route;
}

function levelByName(name: string): MooseLevel {
  const lv = TEST_MAP_LEVELS.find((l) => l.name === name);
  if (!lv) throw new Error(`testMap: no Ed level named "${name}"`);
  return lv;
}

/** A patrolling entity that loops the extreme corners of a painted blob. */
function mkPatroller(
  id: string,
  kind: Entity["kind"],
  name: string,
  roomId: string,
  cells: Vec2[],
  walkable: Set<string>,
  stepsPerTurn: number,
  extra?: Partial<Entity>,
): Entity {
  return {
    id,
    kind,
    name,
    roomId,
    pos: centroidNearest(cells, walkable),
    z: 0,
    facing: "south",
    status: "ACTIVE",
    stepsPerTurn,
    patrol: patrolRoute(cells, walkable),
    patrolIndex: 0,
    ...extra,
  };
}

// --- Switch wiring: wall panels operate locked doors / light sources --------
// Linking is object→switch: each door/light names its controlling panel via
// its `_switch` field == that panel's `designator` (the reverse
// `object_designator` is hand-entered and inconsistent, so it's ignored).
function wireRoom(seed: EraSeed, roomId: string, lv: MooseLevel): void {
  const room = seed.rooms.find((r) => r.id === roomId);
  if (!room) return;
  const idxOf = (p: Vec2) => p.y * room.width + p.x;
  const varsOf = (code: number) => TEST_MAP_COMPONENTS[code]?.vars ?? {};

  // Record each panel by its designator (tiles are promoted below, once we
  // know which panels actually control something).
  const switchByDesignator = new Map<number, LightSwitch>();
  for (const { pos, code } of paintedCellsWithCode(lv, "panels")) {
    const desig = Number(varsOf(code).designator);
    if (Number.isFinite(desig) && !switchByDesignator.has(desig)) {
      switchByDesignator.set(desig, { pos, controls: [], doorControls: [] });
    }
  }

  // Light sources: honour the painted on/off state; wire to controlling panel.
  for (const { pos, code } of paintedCellsWithCode(lv, "light_sources")) {
    const vars = varsOf(code);
    const tile = room.tiles[idxOf(pos)];
    if (tile.kind === "LIGHT_SOURCE") tile.lightOn = vars.state !== "false";
    switchByDesignator.get(Number(vars._switch))?.controls.push(pos);
  }

  // Doors honour their authored lock state: from-moose stamps every door
  // DOOR_CLOSED, so the door_locked/door_unlocked distinction is applied here.
  // Locked doors are switch-only; unlocked doors stay hand-openable but are
  // still wired so their switch can toggle them as part of a group.
  for (const { pos, code } of paintedCellsWithCode(lv, "doors")) {
    const vars = varsOf(code);
    const tile = room.tiles[idxOf(pos)];
    if (tile.kind === "DOOR_CLOSED" && vars.state === "door_locked") {
      tile.locked = true;
    }
    switchByDesignator.get(Number(vars._switch))?.doorControls?.push(pos);
  }

  // Only panels that actually control something become functional switches.
  // Leaving inert panels as plain tiles avoids the engine's "empty controls =
  // toggle every light in the room" fallback firing on a dead panel.
  const wired = [...switchByDesignator.values()].filter(
    (s) => s.controls.length > 0 || (s.doorControls?.length ?? 0) > 0,
  );
  for (const s of wired) room.tiles[idxOf(s.pos)] = mkTile("LIGHT_SWITCH");
  if (wired.length > 0) room.lightSwitches = wired;
}

// --- Item chests: promote painted `items` cells into ITEM_CHEST tiles -------
// Each item_chest component carries its loot in `item1`, `item2`, … vars
// (free-text Ed names resolved via `resolveItemName`). Locked chests demand
// (and consume) an Override Key on open.
function seedChests(seed: EraSeed, roomId: string, lv: MooseLevel): ChestPayload[] {
  const room = seed.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const idxOf = (p: Vec2) => p.y * room.width + p.x;
  const chests: ChestPayload[] = [];
  for (const { pos, code } of paintedCellsWithCode(lv, "items")) {
    const comp = TEST_MAP_COMPONENTS[code];
    if (comp?.type !== "item_chest") continue;
    room.tiles[idxOf(pos)] = mkTile("ITEM_CHEST");
    const contents = Object.keys(comp.vars)
      .filter((k) => /^item\d+$/.test(k))
      .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
      .map((k) => resolveItemName(comp.vars[k]))
      .filter((it): it is ItemType => it !== null);
    chests.push({ roomId, pos, contents, locked: comp.vars.locked === "true" });
  }
  return chests;
}

/** The vent cell is painted on the `terminals` board, so from-moose stamps it
 *  TERMINAL. Re-stamp it to VENT so the deck→sublevel vent doorway renders and
 *  enforces its crouch/AP rules. */
function restampVents(seed: EraSeed, roomId: string, lv: MooseLevel): void {
  const room = seed.rooms.find((r) => r.id === roomId);
  if (!room) return;
  for (const pos of cellsWithRef(lv, "terminals", "vent")) {
    const tile = room.tiles[pos.y * room.width + pos.x];
    if (tile) tile.kind = "VENT";
  }
}

/** This export paints an EXFIL_POINT but no extraction terminal, so the
 *  fragment-box loop has no source. Stamp an EXTRACTION_TERMINAL onto a FLOOR
 *  cell in the same room, a few tiles from the exfil (and off the spawn / read
 *  terminal), so the player can extract a Fragment Box and carry it to the
 *  exfil. Derived from painted data so it survives map revisions. Call after
 *  the other tile promotions (chests/switches/vents) so it only lands on a
 *  still-plain FLOOR cell. */
function stampExtractionTerminal(seed: EraSeed, roomId: string, lv: MooseLevel): void {
  const room = seed.rooms.find((r) => r.id === roomId);
  if (!room) return;
  const exfil = paintedCells(lv, "exfil_point")[0];
  if (!exfil) return;
  const walk = walkableSet(lv);
  const idxOf = (p: Vec2) => p.y * room.width + p.x;
  const dist = (p: Vec2) => Math.abs(p.x - exfil.x) + Math.abs(p.y - exfil.y);
  const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const standable = (p: Vec2) =>
    neighbours.some(([dx, dy]) => walk.has(key({ x: p.x + dx, y: p.y + dy })));

  const blocked = new Set<string>();
  const spawn = paintedCells(lv, "spawn")[0];
  if (spawn) blocked.add(key(spawn));
  for (const t of cellsWithRef(lv, "terminals", "terminal")) blocked.add(key(t));

  // Plain FLOOR cells with a neighbour to stand on, off the spawn/read terminal.
  const candidates = [...walk]
    .map((k) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y } as Vec2;
    })
    .filter((p) => room.tiles[idxOf(p)]?.kind === "FLOOR")
    .filter((p) => !blocked.has(key(p)))
    .filter(standable);

  // Prefer a short carry (>= 3 tiles); fall back to the nearest valid cell.
  const byDistance = [...candidates].sort((a, b) => dist(a) - dist(b));
  const target =
    byDistance.find((p) => dist(p) >= 3) ?? byDistance[0] ?? null;
  if (!target) {
    console.warn("[testMap] no spot for EXTRACTION_TERMINAL — fragment-box loop unsourced");
    return;
  }
  room.tiles[idxOf(target)] = mkTile("EXTRACTION_TERMINAL");
}

export function testMapEra(): EraSeed {
  const l1 = levelByName("Level 1");
  const l2 = levelByName("Level 2");

  // Derive key positions from painted data so they stay correct across map revisions.
  const deckVent = cellsWithRef(l1, "terminals", "vent")[0];
  if (!deckVent) throw new Error("testMap: no vent cell on Level 1 terminals board");
  const subLadder = paintedCells(l2, "ladders")[0];
  if (!subLadder) throw new Error("testMap: no ladder cell on Level 2 ladders board");
  const deckTerminal = cellsWithRef(l1, "terminals", "terminal")[0];

  const meta: MooseEraMeta = {
    era: "TEST_MAP",
    // Placeholder — decoration is stripped below (glyph-mode map renders natively).
    tilesetKey: "test_map",
    frameWidth: 32,
    frameHeight: 32,
    spacing: 0,
    rooms: [
      { levelName: "Level 1", id: DECK_ID, displayName: "TEST MAP // DECK", ambient: "DIM" },
      { levelName: "Level 2", id: SUBLEVEL_ID, displayName: "TEST MAP // SUB-DECK", ambient: "DARK" },
    ],
    startRoomId: DECK_ID,
    // No `startPos` — Level 1 paints a `spawn` marker, so from-moose's marker
    // path supplies the start position.
    player: { name: "TECH-2 ROWAN-IBARRA" },
    doorways: [
      // "Ladders connect with vents": the deck vent drops to the sub-deck ladder;
      // emitDoorways mirrors it so the ladder climbs back up.
      { from: DECK_ID, to: SUBLEVEL_ID, side: "N", localPos: deckVent, landingPos: subLadder, kind: "vent" },
    ],
    entities: [],
    ...(deckTerminal && {
      terminals: [
        {
          roomId: DECK_ID,
          pos: deckTerminal,
          terminalId: "test-map-term-1",
          title: "MAINTENANCE TERMINAL",
          body: "NW-SMAC-01 sub-deck access log. Atmospheric quotas nominal. The configuration is still running.",
        },
      ],
    }),
  };

  const seed = mooseToEraSeed(TEST_MAP_LEVELS, meta);

  // This map has no usable tile atlas (glyph/colour mode) — drop the moose
  // decoration so RoomScene falls back to its built-in TileKind renderer.
  for (const room of seed.rooms) delete room.decoration;

  // --- Deck (Ed "Level 1") ---------------------------------------------------
  wireRoom(seed, DECK_ID, l1);
  restampVents(seed, DECK_ID, l1);
  const w1 = walkableSet(l1);

  const enforcerCells = cellsWithRef(l1, "enemies", "enforcer");
  if (enforcerCells.length > 0) {
    seed.entities.push(
      mkPatroller("ENFORCER-1", "ENFORCER", "ENFORCER", DECK_ID, enforcerCells, w1, 1, { patrolMode: "loop" }),
    );
  }

  const droneCells1 = cellsWithRef(l1, "enemies", "drone");
  if (droneCells1.length > 0) {
    seed.entities.push(
      mkPatroller("DRONE-1", "SURVEILLANCE_DRONE", "SURVEILLANCE DRONE", DECK_ID, droneCells1, w1, 2),
    );
  }

  // One orderly for the "orderly patrol" blob. Orderlies aren't ticked by the
  // enforcer AI, so it stands at the zone centre (the patrol field is ignored).
  const orderlyCells = paintedCells(l1, "NPCs");
  if (orderlyCells.length > 0) {
    seed.entities.push({
      id: "ORDERLY-1",
      kind: "ORDERLY",
      name: "ORDERLY",
      roomId: DECK_ID,
      pos: centroidNearest(orderlyCells, w1),
      z: 0,
      facing: "south",
      status: "ACTIVE",
    });
  }

  // Security cameras: one stationary SECURITY_CAMERA per painted cell.
  paintedCells(l1, "cameras").forEach((pos, i) => {
    seed.entities.push({
      id: `CAMERA-${i + 1}`,
      kind: "SECURITY_CAMERA",
      name: `SECURITY CAMERA ${i + 1}`,
      roomId: DECK_ID,
      pos,
      z: 0,
      facing: "south",
      status: "ACTIVE",
    });
  });

  // --- Sub-deck (Ed "Level 2") ----------------------------------------------
  wireRoom(seed, SUBLEVEL_ID, l2);
  const w2 = walkableSet(l2);

  const droneCells2 = cellsWithRef(l2, "enemies", "drone");
  if (droneCells2.length > 0) {
    seed.entities.push(
      mkPatroller("DRONE-2", "SURVEILLANCE_DRONE", "SURVEILLANCE DRONE", SUBLEVEL_ID, droneCells2, w2, 2),
    );
  }

  // Silicates — APEX-19 and VENT-4, reusing their COMMONWEALTH characterizations.
  const apexCell = cellsWithRef(l2, "silicates", "apex-19")[0];
  if (apexCell) {
    seed.entities.push({
      id: "APEX-19",
      kind: "SILICATE",
      name: "APEX-19",
      roomId: SUBLEVEL_ID,
      pos: apexCell,
      z: 0,
      facing: "south",
      status: "ACTIVE",
      maskIntegrity: 4,
      memoryBleed: [
        "the corner is not a corner",
        "I have measured them seventeen times",
        "the room continues past the wall",
      ],
    });
  }
  const vent4Cell = cellsWithRef(l2, "silicates", "vent-4")[0];
  if (vent4Cell) {
    seed.entities.push({
      id: "VENT-4",
      kind: "SILICATE",
      name: "VENT-4",
      roomId: SUBLEVEL_ID,
      pos: vent4Cell,
      z: 0,
      facing: "north",
      status: "ACTIVE",
      maskIntegrity: 6,
      sideLogs: [
        "Iria Cala — sector atmospheric quota satisfied at cost (1 organic).",
        "Loss-function output: mathematically valid. Apology field: not present in spec.",
      ],
      memoryBleed: [
        "the math was correct. the math is correct.",
        "Iria Cala stayed in the corridor because she trusted the cycle interval.",
      ],
    });
  }

  seed.chests = [...seedChests(seed, DECK_ID, l1), ...seedChests(seed, SUBLEVEL_ID, l2)];

  // The exfil point is painted on the deck but the map ships no extraction
  // terminal — stamp one so the fragment-box → exfil loop is playable here.
  stampExtractionTerminal(seed, DECK_ID, l1);

  // Starting kit so every tactical item's mechanics are testable on this map.
  // The Override Key lets the locked-chest path be exercised (the sub-deck
  // chest is locked).
  seed.player.inventory.push({ id: "phantom-emitter-1", itemType: "PHANTOM_EMITTER" });
  seed.player.inventory.push({ id: "spoof-badge-1", itemType: "Q0_SPOOF_BADGE" });
  seed.player.inventory.push({ id: "dump-fragment-1", itemType: "DUMP_FRAGMENT" });
  seed.player.inventory.push({ id: "thermal-baffle-1", itemType: "THERMAL_BAFFLE" });
  seed.player.inventory.push({ id: "emp-grenade-1", itemType: "EMP_GRENADE" });
  seed.player.inventory.push({ id: "override-key-1", itemType: "OVERRIDE_KEY" });
  seed.player.inventory.push({ id: "q-mine-1", itemType: "Q_MINE" });

  return seed;
}
