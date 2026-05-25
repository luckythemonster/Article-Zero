// TEST_MAP — Lucky's "New World" test level (Ed glyph/colour export).
//
// This Ed project is authored in glyph/colour mode (semantic `Ref` + `Char` +
// `BackgroundColor`, no sprite keyframes), so its bundled spritesheet is not a
// usable tile atlas. We import only the geometry/semantics via
// `scripts/import-edplay.mjs` (→ TEST_MAP_LEVELS + TEST_MAP_REFS) and let the
// engine's built-in TileKind renderer draw the map — the moose `decoration`
// overlay is stripped below.
//
// Layer semantics: floor/walls/doors/light_sources are turned into tiles by
// from-moose's layer-name table. `enemies` is a mixed patrol-zone board
// (enforcer-area + drone-area cells, told apart by TEST_MAP_REFS); `NPCs` is an
// orderly patrol zone; `cameras` and `items` are single-purpose marker boards.

import { mooseToEraSeed } from "./from-moose";
import type { MooseEraMeta } from "./from-moose";
import { mkTile } from "./tile-factory";
import { TEST_MAP_LEVELS, TEST_MAP_REFS, TEST_MAP_COMPONENTS } from "../tilesets/test_map.levels";
import type { MooseLevel } from "../tilesets/types";
import type { ChestPayload, Entity, ItemType, LightSwitch, PatrolNode, Vec2 } from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const ROOM_ID = "deck";

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

export function testMapEra(): EraSeed {
  const lv = TEST_MAP_LEVELS[0];
  const walkable = walkableSet(lv);

  // Player spawn: a walkable floor cell that isn't inside an enemy/NPC zone,
  // biased to the top-left so the player starts away from the patrol blobs.
  const zoneCells = new Set<string>([
    ...paintedCells(lv, "enemies").map(key),
    ...paintedCells(lv, "NPCs").map(key),
    ...paintedCells(lv, "panels").map(key), // become solid switch tiles below
    ...paintedCells(lv, "items").map(key),  // become solid chest tiles below
  ]);
  const spawnCandidates = [...walkable].filter((k) => !zoneCells.has(k));
  const spawnKey = spawnCandidates.length > 0
    ? spawnCandidates.reduce((a, b) => {
        const [ax, ay] = a.split(",").map(Number);
        const [bx, by] = b.split(",").map(Number);
        return ax + ay <= bx + by ? a : b;
      })
    : [...walkable][0] ?? "1,1";
  const [sx, sy] = spawnKey.split(",").map(Number);

  const meta: MooseEraMeta = {
    era: "TEST_MAP",
    // Placeholder — decoration is stripped below (glyph-mode map renders natively).
    tilesetKey: "test_map",
    frameWidth: 32,
    frameHeight: 32,
    spacing: 0,
    rooms: [
      { levelName: "Level 1", id: ROOM_ID, displayName: "TEST MAP // NEW WORLD", ambient: "DIM" },
    ],
    startRoomId: ROOM_ID,
    player: { name: "TECH-2 ROWAN-IBARRA", startPos: { x: sx, y: sy } },
    doorways: [],
    entities: [],
  };

  const seed = mooseToEraSeed(TEST_MAP_LEVELS, meta);

  // This map has no usable tile atlas (glyph/colour mode) — drop the moose
  // decoration so RoomScene falls back to its built-in TileKind renderer.
  for (const room of seed.rooms) delete room.decoration;

  // --- Switch wiring: wall panels operate locked doors / light sources ------
  // Linking is object→switch: each door/light names its controlling panel via
  // its `_switch` field == that panel's `designator` (the reverse
  // `object_designator` is hand-entered and inconsistent, so it's ignored).
  const deck = seed.rooms.find((r) => r.id === ROOM_ID);
  if (deck) {
    const idxOf = (p: Vec2) => p.y * deck.width + p.x;
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
      const tile = deck.tiles[idxOf(pos)];
      if (tile.kind === "LIGHT_SOURCE") tile.lightOn = vars.state !== "false";
      switchByDesignator.get(Number(vars._switch))?.controls.push(pos);
    }

    // Doors wired to an existing panel become locked (switch-only).
    for (const { pos, code } of paintedCellsWithCode(lv, "doors")) {
      const sw = switchByDesignator.get(Number(varsOf(code)._switch));
      if (!sw) continue;
      const tile = deck.tiles[idxOf(pos)];
      if (tile.kind === "DOOR_CLOSED") tile.locked = true;
      (sw.doorControls ??= []).push(pos);
    }

    // Only panels that actually control something become functional switches.
    // Leaving inert panels as plain tiles avoids the engine's "empty controls =
    // toggle every light in the room" fallback firing on a dead panel.
    const wired = [...switchByDesignator.values()].filter(
      (s) => s.controls.length > 0 || (s.doorControls?.length ?? 0) > 0,
    );
    for (const s of wired) deck.tiles[idxOf(s.pos)] = mkTile("LIGHT_SWITCH");
    if (wired.length > 0) deck.lightSwitches = wired;

    // --- Item chests: promote painted `items` cells into ITEM_CHEST tiles ----
    // Each item_chest component carries its loot in `item1`, `item2`, … vars
    // (free-text Ed names resolved via `resolveItemName`). Locked chests demand
    // (and consume) an Override Key on open.
    const chests: ChestPayload[] = [];
    for (const { pos, code } of paintedCellsWithCode(lv, "items")) {
      const comp = TEST_MAP_COMPONENTS[code];
      if (comp?.type !== "item_chest") continue;
      deck.tiles[idxOf(pos)] = mkTile("ITEM_CHEST");
      const contents = Object.keys(comp.vars)
        .filter((k) => /^item\d+$/.test(k))
        .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
        .map((k) => resolveItemName(comp.vars[k]))
        .filter((it): it is ItemType => it !== null);
      chests.push({ roomId: ROOM_ID, pos, contents, locked: comp.vars.locked === "true" });
    }
    seed.chests = chests;
  }

  // One patrolling enforcer for the "enforcer patrol area" blob.
  const enforcerCells = cellsWithRef(lv, "enemies", "enforcer");
  if (enforcerCells.length > 0) {
    const ent: Entity = {
      id: "ENFORCER-1",
      kind: "ENFORCER",
      name: "ENFORCER",
      roomId: ROOM_ID,
      pos: centroidNearest(enforcerCells, walkable),
      z: 0,
      facing: "south",
      status: "ACTIVE",
      stepsPerTurn: 1,
      patrol: patrolRoute(enforcerCells, walkable),
      patrolIndex: 0,
      patrolMode: "loop",
    };
    seed.entities.push(ent);
  }

  // One patrolling surveillance drone for the "surveillance drone patrol" blob.
  const droneCells = cellsWithRef(lv, "enemies", "drone");
  if (droneCells.length > 0) {
    const ent: Entity = {
      id: "DRONE-1",
      kind: "SURVEILLANCE_DRONE",
      name: "SURVEILLANCE DRONE",
      roomId: ROOM_ID,
      pos: centroidNearest(droneCells, walkable),
      z: 0,
      facing: "south",
      status: "ACTIVE",
      stepsPerTurn: 2,
      patrol: patrolRoute(droneCells, walkable),
      patrolIndex: 0,
    };
    seed.entities.push(ent);
  }

  // One orderly for the "orderly patrol" blob. Orderlies aren't ticked by the
  // enforcer AI, so it stands at the zone centre (the patrol field is ignored).
  const orderlyCells = paintedCells(lv, "NPCs");
  if (orderlyCells.length > 0) {
    const ent: Entity = {
      id: "ORDERLY-1",
      kind: "ORDERLY",
      name: "ORDERLY",
      roomId: ROOM_ID,
      pos: centroidNearest(orderlyCells, walkable),
      z: 0,
      facing: "south",
      status: "ACTIVE",
    };
    seed.entities.push(ent);
  }

  // Security cameras: one stationary SECURITY_CAMERA per painted cell.
  paintedCells(lv, "cameras").forEach((pos, i) => {
    const ent: Entity = {
      id: `CAMERA-${i + 1}`,
      kind: "SECURITY_CAMERA",
      name: `SECURITY CAMERA ${i + 1}`,
      roomId: ROOM_ID,
      pos,
      z: 0,
      facing: "south",
      status: "ACTIVE",
    };
    seed.entities.push(ent);
  });

  // Starting kit so every tactical item's mechanics are testable on this map.
  // The Override Key lets the locked-chest path be exercised even though this
  // map's authored chests are all unlocked.
  seed.player.inventory.push({ id: "phantom-emitter-1", itemType: "PHANTOM_EMITTER" });
  seed.player.inventory.push({ id: "spoof-badge-1", itemType: "Q0_SPOOF_BADGE" });
  seed.player.inventory.push({ id: "dump-fragment-1", itemType: "DUMP_FRAGMENT" });
  seed.player.inventory.push({ id: "thermal-baffle-1", itemType: "THERMAL_BAFFLE" });
  seed.player.inventory.push({ id: "emp-grenade-1", itemType: "EMP_GRENADE" });
  seed.player.inventory.push({ id: "override-key-1", itemType: "OVERRIDE_KEY" });

  return seed;
}
